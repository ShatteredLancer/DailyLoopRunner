function responseError(status) {
  return new Error(`HTTP ${status}`);
}

export function createHttpAdapter(options = {}) {
  const gmRequest = options.gmRequest;
  const fetchImpl = options.fetchImpl;
  const runtimeFallback = options.runtimeFallback;

  function requestText(method, url, requestOptions = {}) {
    const headers = requestOptions.headers || undefined;
    const timeout = Math.max(1, Number(requestOptions.timeout || 10000) || 10000);
    if (typeof gmRequest === 'function') {
      return new Promise((resolve, reject) => {
        const request = {
          method,
          url,
          nocache: method === 'GET',
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) resolve(response.responseText);
            else reject(responseError(response.status));
          },
          onerror: () => reject(new Error('request failed')),
          ontimeout: () => reject(new Error('request timed out')),
          timeout,
        };
        if (headers) request.headers = headers;
        if (requestOptions.data !== undefined) request.data = requestOptions.data;
        if (requestOptions.sendCookies !== undefined) request.anonymous = requestOptions.sendCookies !== true;
        gmRequest(request);
      });
    }

    if (requestOptions.useRuntimeFallback === true && typeof runtimeFallback === 'function') {
      return Promise.resolve(runtimeFallback(url, requestOptions));
    }

    if (typeof fetchImpl !== 'function') return Promise.reject(new Error('HTTP transport is unavailable'));
    const fetchOptions = { cache: 'no-store' };
    if (method !== 'GET') fetchOptions.method = method;
    if (headers) fetchOptions.headers = headers;
    if (requestOptions.data !== undefined) fetchOptions.body = requestOptions.data;
    if (requestOptions.sendCookies !== undefined) {
      fetchOptions.credentials = requestOptions.sendCookies === true ? 'include' : 'omit';
    }
    return fetchImpl(url, fetchOptions).then((response) => {
      if (!response.ok) throw responseError(response.status);
      return response.text();
    });
  }

  function getText(url, requestOptions = {}) {
    return requestText('GET', url, requestOptions);
  }

  function postText(url, data, requestOptions = {}) {
    return requestText('POST', url, { ...requestOptions, data });
  }

  return Object.freeze({ getText, postText, requestText });
}
