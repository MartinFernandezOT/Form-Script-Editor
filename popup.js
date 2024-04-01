document.addEventListener('DOMContentLoaded', function () {
    // Load default configurations
    chrome.storage.local.get(['tabSize', 'theme'], async function(result) {
        if (!result.tabSize) {
            await chrome.storage.local.set({ tabSize: 4 });
        }

        if (!result.theme) {
            await chrome.storage.local.set({ theme: 'vs-dark' });
        }
    });

    document.getElementById('open-fse').addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tabId = tabs[0].id;

            chrome.storage.local.set({ tabId });

            chrome.tabs.sendMessage(tabId, { action: 'getFormScriptSrc' }, async function (response) {
                if (response) {
                    if (response.src) {
                        await chrome.storage.local.set({ scriptUrl: response.src });
                    } else if (response.error) {
                        console.error(response.error);
                    }
                } else {
                    console.error('No response received from content script');
                }
            });
        });
        
        chrome.tabs.create({ url: 'tab.html' });
    });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getFormId' }, function (response) {
            if (response) {
                if (response.formId) {
                    chrome.storage.local.set({ formId: response.formId }, function() {
                        let enabledScriptsCount;
                        chrome.storage.local.get([`active_scripts:${response.formId}`], function(result) {
                            enabledScriptsCount = result[`active_scripts:${response.formId}`];
                            if (enabledScriptsCount) {
                                document.getElementById('enabled-scripts-count').innerText = enabledScriptsCount;
                            }
                        })
                    });
                } else if (response.error) {
                    console.error(response.error);
                }
            }
        });
    });
})