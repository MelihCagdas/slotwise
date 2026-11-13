/**
 * Jira Sprint Calendar, background worker.
 * Reads Jira on behalf of the panel, using the Jira sign-in the browser
 * already has. It only ever sends GET requests to *.atlassian.net.
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'jsc-jira') return false;

  var site = String(message.site || '');
  var path = String(message.path || '');
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/.test(site) || path.indexOf('/rest/api/3/') !== 0) {
    sendResponse({ ok: false, status: 0, error: 'Not a Jira Cloud address.' });
    return false;
  }

  fetch(site + path, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  }).then(function (response) {
    return response.text().then(function (text) {
      var data = null;
      try { data = JSON.parse(text); } catch (e) { /* not JSON, for example a sign-in page */ }
      sendResponse({ ok: response.ok, status: response.status, data: data });
    });
  }).catch(function (error) {
    sendResponse({ ok: false, status: 0, error: String(error && error.message || error) });
  });
  return true; // the answer is sent later
});
