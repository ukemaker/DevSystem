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
            allData = await dataManager.getAllItems();
            
            // Render the new tree view
            renderTreeView(allData);

            // Update the datalists
            populateModuleDatalist();
            populateKeyDatalist();

        } catch (error) {
            console.error('Failed to refresh display:', error);
            dataDisplayTree.innerHTML = '<p>Error loading data.</p>';
        }
    }

    function renderTreeView(data) {
        dataDisplayTree.innerHTML = ''; // Clear previous tree
        if (Object.keys(data).length === 0) {
            dataDisplayTree.textContent = '[No data in store]';
            return;
        }
        const rootUl = document.createElement('ul');
        buildTree(data, rootUl);
        dataDisplayTree.appendChild(rootUl);
    }

    function buildTree(obj, parentElement) {
        for (const key in obj) {
            const li = document.createElement('li');
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key';
            keySpan.textContent = `${key}: `;

            if (typeof obj[key] === 'object' && obj[key] !== null) {
                const toggle = document.createElement('span');
                toggle.className = 'tree-toggle';
                li.appendChild(toggle);
                li.appendChild(keySpan);
                const ul = document.createElement('ul');
                ul.style.display = 'none'; // Start collapsed
                buildTree(obj[key], ul);
                li.appendChild(ul);
            } else {
                const valueSpan = document.createElement('span');
                valueSpan.className = 'tree-value';
                valueSpan.textContent = `"${obj[key]}"`;
                li.append(keySpan, valueSpan);
            }
            parentElement.appendChild(li);
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
            const sublist = event.target.nextElementSibling.nextElementSibling;
            if (sublist && sublist.tagName === 'UL') {
                event.target.classList.toggle('expanded');
                sublist.style.display = sublist.style.display === 'none' ? 'block' : 'none';
            }
        }
    });
    fetchButton.addEventListener('click', refreshDisplay);
    moduleInput.addEventListener('input', populateKeyDatalist);
    keyInput.addEventListener('input', populateValueInput);
    clearButton.addEventListener('click', handleClearAll);
    exportButton.addEventListener('click', dataManager.exportDataAsJson);
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
