import { dataManager } from '../../shared/dm.js';
import { styleManager } from '../../shared/sm.js';

// --- Main App Setup ---
const contentArea = document.getElementById('content-area');
const navButtons = {
    'bolt-hole-circle': document.getElementById('nav-bolt-hole-circle'),
    'line-holes': document.getElementById('nav-line-holes'),
    'arc-milling': document.getElementById('nav-arc-milling'),
    'calc-conv': document.getElementById('nav-calc-conv'),
    // Settings Submenu
    'system': document.getElementById('nav-system'),
    'model': document.getElementById('nav-model'),
    'machine': document.getElementById('nav-machine'),
    'display': document.getElementById('nav-display'),
    'print': document.getElementById('nav-print'),
    'program': document.getElementById('nav-program'),
};
const settingsToggle = document.getElementById('nav-settings-toggle');
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
        if (viewName === 'program') {
            setupProgramView();
        }

    } catch (error) {
        console.error(`Error loading view: ${viewName}`, error);
        contentArea.innerHTML = `<p>Error loading module. Please check the console.</p>`;
    }
}

// --- Program Settings View ---
function setupProgramView() {
    setupDataManagement();
    setupStyleManagement();
}

function setupDataManagement() {
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
    const dataStatusIndicator = document.getElementById('data-status-indicator');

    let allData = {}; // Cache the data store for efficiency
    let isDataDirty = false; // Track if changes have been made since last save/load

    // --- UI Update Functions ---
    function updateStatusIndicator() {
        if (!dataStatusIndicator) return;
        if (isDataDirty) {
            dataStatusIndicator.textContent = 'Local storage has unsaved changes.';
            dataStatusIndicator.className = 'dirty';
        } else {
            dataStatusIndicator.textContent = 'Local storage is in sync.';
            dataStatusIndicator.className = 'synced';
        }
    }
    
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

            if (moduleInput) moduleInput.placeholder = `Select or type new ${moduleLabel}`;
            if (keyInput) keyInput.placeholder = `Select or type new ${keyLabel}`;
            if (valueInput) valueInput.placeholder = `${valueLabel} Value`;
            
            // Render the new tree view
            renderTreeView(allData, labels);

            // Update the datalists with the actual data
            populateModuleDatalist();
            populateKeyDatalist();

        } catch (error) {
            console.error('Failed to refresh display:', error);
            if (dataDisplayTree) dataDisplayTree.innerHTML = '<p>Error loading data.</p>';
        }
    }

    function renderTreeView(data, labels) {
        if (!dataDisplayTree) return;
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
        if (!moduleList) return;
        moduleList.innerHTML = ''; // Clear existing options
        Object.keys(allData).forEach(moduleName => {
            const option = document.createElement('option');
            option.value = moduleName;
            moduleList.appendChild(option);
        });
    }

    function populateKeyDatalist() {
        if (!keyList || !moduleInput) return;
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
        if (!moduleInput || !keyInput || !valueInput) return;
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
            isDataDirty = true;
            updateStatusIndicator();
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
                isDataDirty = true;
                updateStatusIndicator();
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
                isDataDirty = true;
                updateStatusIndicator();
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
            isDataDirty = false;
            updateStatusIndicator();
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
            isDataDirty = false;
            updateStatusIndicator();
            await refreshDisplay();
            alert('Data loaded successfully!');
        } catch (error) {
            alert(`Failed to load data: ${error.message}`);
        } finally {
            importFileInput.value = '';
        }
    }

    // --- Event Listeners ---
    if (setItemButton) setItemButton.addEventListener('click', handleSetItem);
    if (deleteItemButton) deleteItemButton.addEventListener('click', handleDeleteItem);
    if (dataDisplayTree) {
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
    }
    if (fetchButton) fetchButton.addEventListener('click', refreshDisplay);
    if (moduleInput) moduleInput.addEventListener('input', populateKeyDatalist);
    if (keyInput) keyInput.addEventListener('input', populateValueInput);
    if (clearButton) clearButton.addEventListener('click', handleClearAll);
    if (exportButton) exportButton.addEventListener('click', handleExport);
    if (importButton) importButton.addEventListener('click', () => importFileInput.click());
    if (importFileInput) importFileInput.addEventListener('change', handleLoadFromJson);

    // Initial data load for this view
    updateStatusIndicator();
    refreshDisplay();
}

function setupStyleManagement() {
    const container = document.getElementById('style-manager-container');
    if (container) {
        styleManager.renderUI(container);
    }
}

// --- App Initialization ---
if (settingsToggle) {
    settingsToggle.addEventListener('click', (e) => {
        // Prevent navigation, just toggle the menu
        e.preventDefault();
        const navGroup = settingsToggle.closest('.nav-group');
        if (navGroup) {
            navGroup.classList.toggle('expanded');
        }
    });
}

Object.entries(navButtons).forEach(([viewName, button]) => {
    if (button) {
        button.addEventListener('click', () => loadView(viewName));
    }
});

// Load the default view when the application starts
loadView('bolt-hole-circle');
