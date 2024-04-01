chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "executeScript" && message.script) {
        chrome.scripting.executeScript({
            target: { tabId: message.tabId },
            function: new Function(message.script)
        });
    }
});