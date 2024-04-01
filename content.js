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

    if (request.action === 'executeFunction') {
        if (request.name && request.group) {
            const fn = new Function(request.args, request.code);

            switch (request.group) {
                case 'form':
                    window[request.name] = fn;
                    break;
                case 'template':
                    window.VV.Form.Template[request.name] = fn;
                    break;
                case 'global':
                    window.VV.Form.Global[request.name] = fn;
                    break;
            }
        }
    }
});