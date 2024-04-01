require.config({ paths: { vs: './vs' } });
require(['vs/editor/editor.main'], async function () {
    const DB_NAME = 'fseextdb';
    let db;
    let scriptToRestore = null;
    let activeScripts = 0;

    async function getItem(itemKey) {
        const result = await chrome.storage.local.get([itemKey]);
        return result[itemKey];
    }

    async function setItem(itemKey, value) {
        await chrome.storage.local.set({ [itemKey]: value });
    }

    // Open IndexedDB Database
    const formId = await getItem('formId');

    const tabSize = await getItem('tabSize');
    const theme = await getItem('theme');

    document.getElementById('tab-size').value = tabSize;
    document.getElementById('theme').value = theme;

    var editor = monaco.editor.create(document.getElementById('editor'), {
        value: '',
        language: 'javascript',
        theme,
        tabSize
    });

    const functionList = document.getElementById('function-list');
    const errorMessage = document.getElementById('error-message');
    const settingsButton = document.getElementById('settings-button');
    const settingsModal = document.getElementById('settings-modal');
    const saveSettingsButton = document.getElementById('save-settings');
    const cancelSettingsButton = document.getElementById('cancel-settings');
    const tabSizeSelect = document.getElementById('tab-size');
    const themeSelect = document.getElementById('theme');
    const tabForm = document.getElementById('tab-form');
    const tabTemplate = document.getElementById('tab-template');
    const tabGlobal = document.getElementById('tab-global');
    const saveButton = document.getElementById('save-changes');
    const scriptsModalButton = document.getElementById('scripts-modal-button');
    const closeScriptsModalElement = document.getElementById('close-scripts-modal');
    const scriptsModal = document.getElementById('scripts-modal');
    const restoreConfirmationModal = document.getElementById('restore-confirmation-modal');
    const cancelRestore = document.getElementById('cancel-restore');
    const confirmRestore = document.getElementById('confirm-restore');
    const restoreChanges = document.getElementById('restore-changes');

    var selectedTab = 'form';

    function increaseActiveScripts() {
        const scriptKey = `active_scripts:${formId}`;
        chrome.storage.local.set({ [scriptKey]: activeScripts++ });
    }

    function openDB() {
        const req = indexedDB.open(DB_NAME, 1);

        req.onupgradeneeded = function () {
            const db = req.result;

            if (!db.objectStoreNames.contains(formId)) {
                db.createObjectStore(formId, { keyPath: 'name' });
            }
        };

        req.onsuccess = function () {
            db = req.result;
        }

        req.onerror = function (event) {
            console.error(`Couldn't create the object store for the form "${formId}: ${event}`);
        }
    }

    openDB();

    /** Get the script data from the database
     * 
     * @param {String} scriptName The script name
     * @returns {Promise<any>} A promise with the get result
     */
    async function getScript(scriptName) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(formId, 'readonly');
            const objectStore = transaction.objectStore(formId);
            const req = objectStore.get(scriptName);

            req.onsuccess = function () {
                resolve(req.result);
            };

            req.onerror = function () {
                console.error(`getScript couldn't get the script ${scriptName} from the database`);
                reject(undefined);
            };
        });
    }

    function addScript(scriptData) {
        return new Promise((resolve, reject) => {
            if (!scriptData || !scriptData.name) {
                reject('Invalid scriptData object');
                return;
            }

            const transaction = db.transaction(formId, 'readwrite');
            const objectStore = transaction.objectStore(formId);
            const req = objectStore.add(scriptData);

            req.onsuccess = function () {
                resolve(`Script ${scriptData.name} added to the object store ${formId}`);
            }

            req.onerror = function () {
                reject(`Couldn't add the ${scriptData.name} to the object store ${formId}`);
            }
        });
    }

    function updateScript(scriptData) {
        return new Promise((resolve, reject) => {
            if (!scriptData || !scriptData.name) {
                reject('Invalid scriptData object');
                return;
            }

            const transaction = db.transaction(formId, 'readwrite');
            const objectStore = transaction.objectStore(formId);
            const req = objectStore.put(scriptData);

            req.onsuccess = function () {
                resolve(`Script ${scriptData.name} updated to the object store ${formId}`);
            }

            req.onerror = function () {
                reject(`Couldn't update the ${scriptData.name} to the object store ${formId}`);
            }
        });
    }

    async function getScriptURL() {
        return await getItem('scriptUrl');
    }

    function getCode(name, parameters, code, group) {
        let completeCode = '';

        switch (group) {
            case 'Template':
            case 'Global':
                completeCode = `VV.Form.${group}.${name} = function(${parameters}) {${code}};`;
                break;
            default:
                completeCode = `${name} = function(${parameters}) {${code}};`;
        }

        return completeCode;
    }

    async function fetchFunctions() {
        const scriptUrl = await getScriptURL();

        if (!scriptUrl) {
            return null;
        }

        try {
            const response = await fetch(scriptUrl);
            let scriptContent = await response.text();

            const functionRegex = /^(?:VV\.Form\.(?<group>Template|Global)\.(?<name>\w+)|(\w+))\s=\sfunction\s?\((?<parameters>[^)]*?)\)\s\{(?<code>[\s\S]*?)\}\s*;/gm;

            const result = {
                form: [],
                template: [],
                global: []
            };

            const matches = scriptContent.matchAll(functionRegex);

            for (const match of matches) {
                const { group, parameters, code } = match.groups;
                const name = match.groups.name ? match.groups.name : match[3];

                const groupName = group ? group.toLowerCase() : 'form';

                const scriptData = await getScript(name);
                if (scriptData) {
                    if (scriptData.active) {
                        increaseActiveScripts();

                        const modifiedCode = getCode(name, scriptData.parameters, scriptData.code, group);
                        scriptContent = scriptContent.replace(match[0], modifiedCode);
                        executeScriptInFormTab(name, parameters, scriptData.code, groupName);
                    }

                    result[groupName].push({
                        name: name,
                        parameters: scriptData.parameters,
                        code: getCode(name, scriptData.parameters, scriptData.code, group),
                    });
                } else {
                    result[groupName].push({
                        name: name,
                        parameters: parameters.trim(),
                        code: getCode(name, parameters, code, group)
                    });
                }
            }

            return result;
        } catch (error) {
            console.error('Error fetching script:', error);
            return null;
        }
    }

    function displayFunctions(functions) {
        functionList.innerHTML = '';

        if (!functions) {
            errorMessage.style.display = 'block';
            return;
        }

        errorMessage.style.display = 'none';

        functions[selectedTab].forEach(async function (func) {
            const selectedFileItem = await getItem('file_selected');
            const selectedFile = selectedFileItem && selectedFileItem.split(':');

            var li = document.createElement('li');
            li.textContent = `${func.name} (${func.parameters})`;
            li.id = func.name;
            li.classList.add('py-2', 'px-4', 'cursor-pointer', 'hover:bg-gray-300');
            li.addEventListener('click', async function () {
                var selectedFunction = document.querySelector('.file-selected');
                if (selectedFunction) {
                    selectedFunction.classList.remove('file-selected');
                }
                li.classList.add('file-selected');
                editor.setValue(func.code);
                await setItem('file_selected', `${formId}:${func.name}`);
            });

            if (selectedFile && selectedFile[0] === formId && selectedFile[1] === func.name) {
                editor.setValue(func.code);
                li.classList.add('file-selected');
            }
            functionList.appendChild(li);
        });
    }

    function enableTabs() {
        tabForm.classList.remove('tab-disabled');
        tabTemplate.classList.remove('tab-disabled');
        tabGlobal.classList.remove('tab-disabled');
    }

    function disableTabs() {
        tabForm.classList.add('tab-disabled');
        tabTemplate.classList.add('tab-disabled');
        tabGlobal.classList.add('tab-disabled');
    }

    function showRestoreConfirmation(scriptName) {
        scriptToRestore = scriptName;
        restoreConfirmationModal.classList.remove('hidden');
    }

    function hideRestoreConfirmation() {
        restoreConfirmationModal.classList.add('hidden');
    }    

    function openSettingsModal() {
        settingsModal.classList.remove('hidden');
    }

    function closeSettingsModal() {
        settingsModal.classList.add('hidden');
    }

    async function saveChanges() {
        const editorValue = editor.getValue();

        const functionNameRegex = /^(?:VV\.Form\.(?:Template|Global)\.(\w+)|(\w+))/;
        const parametersRegex = /\((.*)\)/;
        const codeRegex = /{((?:[^{}]+|\{(?:[^{}]+|\{[^{}]*\})*\})*)}\s*;?/;

        const matches = editorValue.match(functionNameRegex);
        const parameterMatches = editorValue.match(parametersRegex);
        const codeMatches = editorValue.match(codeRegex);

        let scriptName;
        if (matches[1]) {
            scriptName = matches[1];
        } else if (matches[0]) {
            scriptName = matches[0];
        }
        const scriptParameters = Array.isArray(parameterMatches) ? parameterMatches[1] : null;
        const code = Array.isArray(codeMatches) ? codeMatches[1] : '';

        if (!scriptName || !scriptParameters) {
            console.error('Invalid Script name or parameters');
            return;
        }

        const scriptData = {
            name: scriptName,
            parameters: scriptParameters,
            code,
            active: true,
        };

        const existingScript = await getScript(scriptName);

        try {
            if (!existingScript) {
                await addScript(scriptData);
            } else {
                await updateScript(scriptData);
            }

            displayFunctions(await fetchFunctions());
        } catch (error) {
            console.error(`Couldn't save the script ${scriptName}: ` + error.errorMessage);
        }
    }

    function openScriptsModal() {
        scriptsModal.classList.remove('hidden');
        loadScriptsToList();
    }

    function closeScriptsModal() {
        scriptsModal.classList.add('hidden');
    }

    async function loadScriptsToList() {
        const scriptList = document.getElementById('script-list');
        scriptList.innerHTML = '';
    
        const transaction = db.transaction(formId, 'readonly');
        const objectStore = transaction.objectStore(formId);
        const request = objectStore.openCursor();
    
        request.onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                const script = cursor.value;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-4 py-2">${script.name}</td>
                    <td class="px-4 py-2">
                        <button class="delete-script bg-red-500 text-white py-1 px-2 rounded mr-2" data-script-name="${cursor.key}">Restore</button>
                    </td>
                    <td class="px-4 py-2">
                        <label class="switch">
                            <input class="change-status" type="checkbox" ${script.active ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </td>
                `;

                row.querySelector('.delete-script').addEventListener('click', function() {
                    showRestoreConfirmation(cursor.key);
                });

                row.querySelector('.change-status').addEventListener('click', function(event) {
                    changeScriptStatus(cursor.key, event.target.checked);
                });

                scriptList.appendChild(row);
                cursor.continue();
            }
        };
    }

    async function changeScriptStatus(scriptName, status) {
        const script = await getScript(scriptName);
        if (!script) {
            console.error('Invalid Script Name');
            return;
        }

        const scriptData = {
            name: scriptName,
            parameters: script.parameters,
            code: script.code,
            active: status
        };

        await updateScript(scriptData);
        displayFunctions(await fetchFunctions());
    }

    async function restoreScript(scriptName) {
        const transaction = db.transaction(formId, 'readwrite');
        const objectStore = transaction.objectStore(formId);
        const request = objectStore.delete(scriptName);
    
        return new Promise((resolve, reject) => {
            request.onsuccess = function() {
                console.log(`Script ${scriptName} restored.`);
                resolve();
            };
    
            request.onerror = function(event) {
                console.error(`Error restoring script ${scriptName}:`, event.target.error);
                reject(event.target.error);
            };
        });
    }

    function executeScriptInFormTab(scriptContent) {
        chrome.storage.local.get(['tabId'], function(result) {
            if (result.tabId) {
                chrome.runtime.sendMessage({
                    action: 'executeScript',
                    tabId: result.tabId,
                    script: scriptContent
                });
            } else {
                console.error('No tabId found in storage');
            }
        });
    }

    settingsButton.addEventListener('click', openSettingsModal);
    cancelSettingsButton.addEventListener('click', closeSettingsModal);

    saveSettingsButton.addEventListener('click', async function () {
        var tabSize = parseInt(tabSizeSelect.value);
        var theme = themeSelect.value;

        editor.updateOptions({
            tabSize: tabSize,
            theme: theme
        });

        chrome.storage.local.set({ tabSize: tabSize });

        closeSettingsModal();
    });

    tabForm.addEventListener('click', async function () {
        selectedTab = 'form';
        displayFunctions(await fetchFunctions());
        tabForm.classList.add('tab-selected');
        tabTemplate.classList.remove('tab-selected');
        tabGlobal.classList.remove('tab-selected');
    });

    tabTemplate.addEventListener('click', async function () {
        selectedTab = 'template';
        displayFunctions(await fetchFunctions());
        tabForm.classList.remove('tab-selected');
        tabTemplate.classList.add('tab-selected');
        tabGlobal.classList.remove('tab-selected');
    });

    tabGlobal.addEventListener('click', async function () {
        selectedTab = 'global';
        displayFunctions(await fetchFunctions());
        tabForm.classList.remove('tab-selected');
        tabTemplate.classList.remove('tab-selected');
        tabGlobal.classList.add('tab-selected');
    });

    settingsModal.addEventListener('click', function (event) {
        if (event.target === settingsModal) {
            closeSettingsModal();
        }
    });

    saveButton.addEventListener('click', async function () {
        await saveChanges();
    });

    restoreChanges.addEventListener('click', function() {
        const selectedScript = document.querySelector('.file-selected');
        if (selectedScript) {
            const scriptName = selectedScript.id;
            showRestoreConfirmation(scriptName);
        }
    });

    cancelRestore.addEventListener('click', hideRestoreConfirmation);

    confirmRestore.addEventListener('click', function() {
        if (scriptToRestore) {
            restoreScript(scriptToRestore).then(async () => {
                hideRestoreConfirmation();
                displayFunctions(await fetchFunctions());
                await loadScriptsToList();
            }).catch(error => {
                console.error(error);
            });
        }
    });

    scriptsModalButton.addEventListener('click', function () {
        openScriptsModal();
    });

    closeScriptsModalElement.addEventListener('click', function () {
        closeScriptsModal();
    });

    // Initial display of functions
    var functions = await fetchFunctions();
    displayFunctions(functions);
    if (functions) {
        enableTabs();
    } else {
        disableTabs();
    }
});