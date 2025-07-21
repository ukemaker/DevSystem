import { dataManager } from './dm.js';
import { styleManager } from './sm.js';

// --- Main App Setup ---
const contentArea = document.getElementById('content-area');
const navDataMgmt = document.getElementById('nav-data-mgmt');
const navStyleMgmt = document.getElementById('nav-style-mgmt');
let currentView = null;

async function loadView(viewName) {
    if (currentView === viewName) return; // Don't reload the same view
    
    try {
        const response = await fetch(`${viewName}.html`);
        if (!response.ok) throw new Error(`Failed to load ${viewName}.html`);
        
        contentArea.innerHTML = await response.text();
        currentView = viewName;
        
        // Update active nav button
        document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`nav-${viewName}`).classList.add('active');
        
        // Run setup function for the loaded view
        if (viewName === 'data-mgmt') {
            setupDataManagementView();
        } else if (viewName === 'style-mgmt') {
            setupStyleManagementView();
        }

    } catch (error) {
        console.error(`Error loading view: ${viewName}`, error);
        contentArea.innerHTML = `<p>Error loading module. Please check the console.</p>`;
    }
}

// --- Data Management View ---
function setupDataManagementView() {
    // Get DOM elements
    const moduleInput = document.getElementById('module-input');
    const moduleList = document.getElementById('module-list');
    const keyInput = document.getElementById('key-input');
    const keyList = document.getElementById('key-list');
    const valueInput = document.getElementById('value-input');
    const setItemButton = document.getElementById('set-item-btn');
    const deleteItemButton = document.getElementById('delete-item-btn');
    const fetchButton = document.getElementById('fetch-btn');
    const clearButton = document.getElementById('clear-btn');
    const dataDisplayTree = document.getElementById('data-display-tree');
    const exportButton = document.getElementById('export-btn');
    const importButton = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');

    let allData = {}; // Cache the data store for efficiency

    // --- Handlers ---
    async function refreshDisplay() {
        try {
            const store = await dataManager.getAllItems();
            
            // Separate schema from data for processing
            const schema = store._schema || {};
            allData = { ...store }; // allData is used by other functions
            delete allData._schema;

            // Update UI labels from schema, with sensible defaults
            const labels = schema.labels || {};
            const moduleLabel = labels.module || 'Module';
            const keyLabel = labels.key || 'Key';
            const valueLabel = labels.value || 'Item';

            moduleInput.placeholder = `Select or type new ${moduleLabel}`;
            keyInput.placeholder = `Select or type new ${keyLabel}`;
            valueInput.placeholder = `${valueLabel} Value`;
            
            // Render the new tree view
            renderTreeView(allData, labels);

            // Update the datalists with the actual data
            populateModuleDatalist();
            populateKeyDatalist();

        } catch (error) {
            console.error('Failed to refresh display:', error);
            dataDisplayTree.innerHTML = '<p>Error loading data.</p>';
        }
    }

    function renderTreeView(data, labels) {
        dataDisplayTree.innerHTML = ''; // Clear previous tree
        if (Object.keys(data).length === 0) {
            dataDisplayTree.textContent = '[No data in store]';
            return;
        }
        const rootUl = document.createElement('ul');
        buildTree(data, rootUl, labels);
        dataDisplayTree.appendChild(rootUl);
    }

    function buildTree(data, parentElement, labels) {
        // Level 0: Iterate through Modules
        for (const moduleName in data) {
            const moduleObject = data[moduleName];
            const moduleLi = document.createElement('li');

            const toggle = document.createElement('span');
            toggle.className = 'tree-toggle expanded'; // Start expanded
            moduleLi.appendChild(toggle);

            // Use the label from the schema for "Module"
            const moduleLabel = labels.module || 'Module';
            moduleLi.innerHTML += `<span class="tree-key">${moduleLabel}: </span><span class="tree-value">"${moduleName}"</span>`;
            
            const keyUl = document.createElement('ul');
            // Level 1: Iterate through Keys and Items
            for (const keyName in moduleObject) {
                const itemValue = moduleObject[keyName];
                const keyLi = document.createElement('li');
                const keyLabel = labels.key || 'Key';
                keyLi.innerHTML = `<span class="tree-key">${keyLabel}: ${keyName}</span>: <span class="tree-value">"${itemValue}"</span>`;
                keyUl.appendChild(keyLi);
            }

            moduleLi.appendChild(keyUl);
            parentElement.appendChild(moduleLi);
        }
    }

    function populateModuleDatalist() {
        moduleList.innerHTML = ''; // Clear existing options
        Object.keys(allData).forEach(moduleName => {
            const option = document.createElement('option');
            option.value = moduleName;
            moduleList.appendChild(option);
        });
    }

    function populateKeyDatalist() {
        const selectedModule = moduleInput.value;
        keyList.innerHTML = ''; // Clear existing options
        if (allData[selectedModule]) {
            Object.keys(allData[selectedModule]).forEach(keyName => {
                const option = document.createElement('option');
                option.value = keyName;
                keyList.appendChild(option);
            });
        }
    }

    function populateValueInput() {
        const selectedModule = moduleInput.value;
        const selectedKey = keyInput.value;
        if (allData[selectedModule] && allData[selectedModule][selectedKey] !== undefined) {
            valueInput.value = allData[selectedModule][selectedKey];
        }
    }

    async function handleSetItem() {
        const module = moduleInput.value.trim();
        const key = keyInput.value.trim();
        const value = valueInput.value.trim();
        if (!module || !key) {
            alert('Module and Key are required.');
            return;
        }
        try {
            await dataManager.setItem(module, key, value);
            await refreshDisplay();
        } catch (error)
        {
            console.error('Failed to set item:', error);
            alert(`Error setting item: ${error.message}`);
        }
    }

    async function handleDeleteItem() {
        const module = moduleInput.value.trim();
        const key = keyInput.value.trim();

        if (!module || !key) {
            alert('Module and Key are required to delete an item.');
            return;
        }

        if (confirm(`Are you sure you want to delete the key "${key}" from module "${module}"?`)) {
            try {
                await dataManager.deleteItem(module, key);
                // Clear inputs after successful deletion
                keyInput.value = '';
                valueInput.value = '';
                await refreshDisplay();
            } catch (error) {
                console.error('Failed to delete item:', error);
                alert(`Error deleting item: ${error.message}`);
            }
        }
    }

    async function handleClearAll() {
        if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
            try {
                await dataManager.clearAllItems();
                await refreshDisplay();
            } catch (error) {
                console.error('Failed to clear items:', error);
                alert('Error clearing data.');
            }
        }
    }

    async function handleExport() {
        try {
            const { blob, filename } = await dataManager.getExportableJson();
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export data:', error);
            alert('Error exporting data.');
        }
    }

    async function handleLoadFromJson() {
        const file = importFileInput.files[0];
        if (!file) return;
        try {
            await dataManager.loadDataFromJson(file);
            await refreshDisplay();
            alert('Data loaded successfully!');
        } catch (error) {
            alert(`Failed to load data: ${error.message}`);
        } finally {
            importFileInput.value = '';
        }
    }

    // --- Event Listeners ---
    setItemButton.addEventListener('click', handleSetItem);
    deleteItemButton.addEventListener('click', handleDeleteItem);
    dataDisplayTree.addEventListener('click', (event) => {
        if (event.target.classList.contains('tree-toggle')) {
            const parentLi = event.target.parentElement;
            const sublist = parentLi.querySelector('ul'); // Find the UL inside the LI
            if (sublist) {
                event.target.classList.toggle('expanded');
                sublist.style.display = sublist.style.display === 'none' ? 'block' : 'none';
            }
        }
    });
    fetchButton.addEventListener('click', refreshDisplay);
    moduleInput.addEventListener('input', populateKeyDatalist);
    keyInput.addEventListener('input', populateValueInput);
    clearButton.addEventListener('click', handleClearAll);
    exportButton.addEventListener('click', handleExport);
    importButton.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleLoadFromJson);

    // Initial data load for this view
    refreshDisplay();
}

// --- Style Management View ---
function setupStyleManagementView() {
    const container = document.getElementById('style-manager-container');
    styleManager.renderUI(container);
}

// --- App Initialization ---
navDataMgmt.addEventListener('click', () => loadView('data-mgmt'));
navStyleMgmt.addEventListener('click', () => loadView('style-mgmt'));

// Load the default view when the application starts
loadView('data-mgmt');
