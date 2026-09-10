#!/usr/bin/env node
/**
 * Creates/refreshes the TalentMatch OpenSearch Dashboards data view and sets it as default.
 * Run after `docker compose up` (Dashboards on :5601, OpenSearch on :9200).
 */
const indexPatternId = 'talentmatch-jobs-v2';
const dashboardsUrl = process.env['OPENSEARCH_DASHBOARDS_URL'] ?? 'http://localhost:5601';

const headers = {
  'Content-Type': 'application/json',
  'osd-xsrf': 'true',
};

async function request(method, path, body) {
  const response = await fetch(`${dashboardsUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text === '' ? null : JSON.parse(text);
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }
  return data;
}

async function waitForDashboards() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const status = await request('GET', '/api/status');
      if (status?.status?.overall?.state === 'green' || status?.version?.number) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`OpenSearch Dashboards not ready at ${dashboardsUrl}`);
}

async function removeStalePatterns() {
  const found = await request(
    'GET',
    '/api/saved_objects/_find?type=index-pattern&per_page=100&search_fields=title&search=talentmatch-jobs',
  );
  for (const object of found.saved_objects ?? []) {
    const title = object.attributes?.title;
    if (title === indexPatternId) continue;
    if (typeof title === 'string' && title.startsWith('talentmatch-jobs')) {
      await request('DELETE', `/api/saved_objects/index-pattern/${object.id}`);
      console.log(`Removed stale data view: ${title}`);
    }
  }
}

async function ensureIndexPattern() {
  try {
    await request('GET', `/api/saved_objects/index-pattern/${indexPatternId}`);
  } catch {
    await request('POST', `/api/saved_objects/index-pattern/${indexPatternId}`, {
      attributes: { title: indexPatternId, timeFieldName: '@timestamp' },
    });
    console.log(`Created data view: ${indexPatternId}`);
  }
}

function toSavedFields(wildcardFields) {
  return wildcardFields.map((field) => ({
    count: 0,
    name: field.name,
    type: field.type,
    scripted: false,
    searchable: field.searchable ?? false,
    aggregatable: field.aggregatable ?? false,
    readFromDocValues: field.readFromDocValues ?? false,
    ...(field.esTypes === undefined ? {} : { esTypes: field.esTypes }),
    ...(field.subType === undefined ? {} : { subType: field.subType }),
  }));
}

async function refreshFieldList() {
  const wildcard = await request(
    'GET',
    `/api/index_patterns/_fields_for_wildcard?pattern=${encodeURIComponent(indexPatternId)}&meta_fields=_source&meta_fields=_id&meta_fields=_index&meta_fields=_score`,
  );
  const fields = toSavedFields(wildcard.fields ?? []);
  const current = await request('GET', `/api/saved_objects/index-pattern/${indexPatternId}`);
  await request('PUT', `/api/saved_objects/index-pattern/${indexPatternId}?refresh=wait_for`, {
    attributes: {
      ...current.attributes,
      title: indexPatternId,
      timeFieldName: '@timestamp',
      fields: JSON.stringify(fields),
    },
    version: current.version,
  });
  console.log(`Refreshed ${fields.length} fields on data view ${indexPatternId}`);
}

async function setDefaultDataView() {
  await request('POST', '/api/opensearch-dashboards/settings', {
    changes: { defaultIndex: indexPatternId },
  });
  console.log(`Default Discover data view: ${indexPatternId}`);
}

await waitForDashboards();
await removeStalePatterns();
await ensureIndexPattern();
await refreshFieldList();
await setDefaultDataView();
console.log(`OpenSearch Dashboards ready: ${dashboardsUrl}/app/discover#/?_g=(time:(from:now-7d,to:now))`);
