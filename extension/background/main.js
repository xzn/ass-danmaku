; (function () {

  /**
   * @typedef TabId
   * @typedef {{ id: string, meta: Object, content: Object }} DanmakuInfo
   * @typedef {{ tabId: TabId, danmakuList: ?Array.<DanmakuInfo>, metaInfo: Object }} PageContent
   */

  /** @type {Map<TabId, PageContent>} */
  const context = new Map();
  /** @type {Map<string, Function>} */
  const exported = new Map();
  /**
   * Export some function via message post to popup pages
   * @param {Function} f
   * @return {Function}
   */
  const messageExport = f => {
    exported.set(f.name, f);
    return (...args) => Promise.resolve(f(...args));
  };

  const pageContext = tabId => {
    if (!context.has(tabId)) {
      context.set(tabId, {
        tabId,
        danmakuList: [],
        metaInfo: {},
      });
    }
    const pageContext = context.get(tabId);
    return pageContext;
  };

  /**
   * @callback onRequestCallback
   * @param {ArrayBuffer} response
   * @param {PageContent} pageContent
   */

  /**
   *
   * @param {Array.<string>} match
   * @param {Function.<ArrayBuffer, Object>} callback
   */
  const onRequest = function (match, callback) {
    browser.webRequest.onBeforeRequest.addListener(details => {
      const { requestId, tabId, url } = details;
      const filter = browser.webRequest.filterResponseData(requestId);
      let capacity = 1 << 24; // 16MiB, this should be enough for our use case
      let size = 0;
      let buffer = new ArrayBuffer(capacity);

      filter.ondata = event => {
        const { data } = event;
        filter.write(data);
        if (!buffer) return;
        const length = data.byteLength;
        if (size + length > capacity) {
          buffer = null;
          return;
        }
        const view = new Uint8Array(buffer, size, length);
        view.set(new Uint8Array(data));
        size += length;
      };

      filter.onstop = event => {
        filter.disconnect();
        if (!buffer) return;
        const response = buffer.slice(0, size);
        buffer = null;
        (async () => {
          const context = pageContext(tabId);
          await callback(response, pageContext(tabId), { url });
          if (context.danmakuList.length) browser.pageAction.show(tabId);
        })();
      };
      return {};
    }, { urls: match }, ['blocking']);
  };

  const revokePageAction = tabId => {
    context.delete(tabId);
    browser.pageAction.hide(tabId);
  };

  const clearPageDanmaku = tabId => {
    const context = pageContext(tabId);
    context.danmakuList.length = 0;
    browser.pageAction.hide(tabId);
  };

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.discarded) {
      revokePageAction(tabId);
    } else if (changeInfo.url) {
      clearPageDanmaku(tabId);
    }
  });
  browser.tabs.onRemoved.addListener(tabId => {
    revokePageAction(tabId);
  });

  const getDanmakuDetail = function (tabId, danmakuId) {
    const pageContext = context.get(tabId);
    if (!pageContext) return null;
    const list = pageContext.danmakuList || [];
    const danmaku = list.find(({ id }) => id === danmakuId);
    return danmaku;
  };

  const random = () => `${Math.random()}`.slice(2);
  const randomStuff = `danmaku-${Date.now()}-${random()}`;
  const downloadDanmakuBaseUrl = browser.extension.getURL('download/danmaku.ass'); // `https://${randomStuff}.ass-danmaku.invalid.example.com/download/danmaku.ass`;
  const listDanmaku = messageExport(function listDanmaku(tabId) {
    const pageContext = context.get(tabId);
    if (!pageContext) return [];
    const list = pageContext.danmakuList || [];
    return list.map(({ id, meta }) => ({
      id,
      meta,
    }));
  });

  const downloadDanmaku = messageExport(async function downloadDanmaku(tabId, danmakuId) {
    const danmaku = getDanmakuDetail(tabId, danmakuId);
    const [options] = await Promise.all([
      window.options.get(),
    ]);
    danmaku.layout = await window.danmaku.layout(danmaku.content, options);
    const content = window.danmaku.ass(danmaku, options);
    const url = window.download.url(content);
    const filename = window.download.filename(danmaku.meta.name, 'ass');
    browser.downloads.download({ filename, url });
  });

  browser.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    const { method, params = [] } = request;
    const handler = exported.get(method);
    const response = await handler(...params);
    return response;
  });

  window.onRequest = onRequest;

  // browser.webRequest.onBeforeRequest.addListener(async details => {
  //   const { requestId, url } = details;
  //   const params = new URLSearchParams(new URL(url).search);
  //   const tabId = +params.get('tabId');
  //   const danmakuId = params.get('danmakuId');
  //   const danmaku = getDanmakuDetail(tabId, danmakuId);

  //   const [options] = await Promise.all([
  //     window.options.get(),
  //   ]);

  //   danmaku.layout = await window.danmaku.layout(danmaku.content, options);
  //   const content = window.danmaku.ass(danmaku, options);
  //   // const objectUrl = await window.download.url(content);
  //   const encoder = new TextEncoder();
  //   // Add a BOM to make some ass parser library happier
  //   const bom = '\ufeff';
  //   const encoded = encoder.encode(bom + content);
  //   const blob = new Blob([encoded], { type: 'application/octet-stream' });
  //   const objectUrl = URL.createObjectURL(blob);

  //   return { redirectUrl: objectUrl };
  // }, { urls: [downloadDanmakuBaseUrl + '?*'] }, ['blocking']);


}());


// cancel function returns an object
// which contains a property `cancel` set to `true`


// // add the listener,
// // passing the filter argument and "blocking"
// browser.webRequest.onBeforeRequest.addListener(
//   function (requestDetails) {
//     console.log(requestDetails);
//     return {};
//   }, { urls: ['*://*/*'] }, ['blocking']
// );
