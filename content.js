chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "getFormScriptSrc") {
        const scriptElement = document.querySelector('script[src*="FormScriptFile"]');
        if (scriptElement) {
            sendResponse({ src: scriptElement.src });
        } else {
            sendResponse({ error: "Script not found" });
        }
        return true;
    }

    if (request.action === "getFormId") {
        const formId = document.querySelector('div[app-formid]').getAttribute('vvfieldid');
        
        if (formId) {
            sendResponse({ formId });
        } else {
            sendResponse({ error: "Form ID not found" });
        }
        return true;
    }

    if (request.action === 'executeScript') {
        eval(request.script);
    }
});