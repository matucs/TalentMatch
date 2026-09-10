import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws-v3';

export function createOpenSearchClient(
  node: string,
  requestTimeout: number,
  awsRegion?: string,
): Client {
  return new Client({
    node,
    requestTimeout,
    ...(awsRegion === undefined ? {} : AwsSigv4Signer({
      region: awsRegion,
      service: 'es',
      getCredentials: defaultProvider(),
    })),
  });
}
