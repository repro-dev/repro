import type { ApiClient } from "@repro/api-client";

export function createRecorderFetchRouter(
  authenticatedClient: Pick<ApiClient, "fetch">,
  anonymousClient: Pick<ApiClient, "fetch">,
  baseUrl: string,
) {
  return function fetch<R = any>(
    url: string,
    options?: Parameters<ApiClient["fetch"]>[1],
    requestType?: Parameters<ApiClient["fetch"]>[2],
    responseType?: Parameters<ApiClient["fetch"]>[3],
  ) {
    if (isRecordingApiRequest(url, baseUrl)) {
      return authenticatedClient.fetch<R>(
        url,
        options,
        requestType,
        responseType,
      );
    }

    return anonymousClient.fetch<R>(url, options, requestType, responseType);
  };
}

export function isRecordingApiRequest(url: string, originBaseUrl: string) {
  const requestUrl = new URL(url, originBaseUrl);
  const baseOrigin = new URL(originBaseUrl).origin;

  return (
    requestUrl.origin === baseOrigin &&
    requestUrl.pathname.startsWith("/projects/")
  );
}
