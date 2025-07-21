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
let currentViewTeardown = null; // Holds a function to run before leaving a view

// --- Global State and UI Management for Data Persistence ---

const globalState = {
    isDirty: false, // Tracks if localStorage has changes not saved to a file
};

/**
 * Updates any UI elements related to the data's dirty status.
 * This function is designed to work on any view that includes the relevant elements.
 */
function updateGlobalDirtyStatusUI() {
    const backupBtn = document.getElementById('backup-btn');
    const statusIndicator = document.getElementById('data-status-indicator');

    if (globalState.isDirty) {
        if (statusIndicator) {
            statusIndicator.textContent = 'Local storage has unsaved changes.';
            statusIndicator.className = 'dirty';
        }
        if (backupBtn) {
            backupBtn.style.display = 'inline-block';
        }
    } else {
        if (statusIndicator) {
            statusIndicator.textContent = 'Local storage is in sync.';
            statusIndicator.className = 'synced';
        }
        if (backupBtn) {
            backupBtn.style.display = 'none';
        }
    }
}

/**
 * Handles the EXPORT process by creating and downloading a file.
 * This function does NOT change the application's dirty state.
 */
async function handleExportOnly() {
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

/**
 * Handles the BACKUP process by exporting data and resetting the dirty state.
 */
async function handleBackupAndReset() {
    await handleExportOnly(); // Reuse export logic
    globalState.isDirty = false;
    updateGlobalDirtyStatusUI();
}

// Map view names to their setup functions for scalability
const viewInitializers = {
    'program': setupProgramView,
    'system': setupSystemView,
};

async function loadView(viewName) {
    if (currentView === viewName) return;

    // Navigation Guard: Check if we can leave the current view
    if (currentViewTeardown) {
        if (!currentViewTeardown()) return; // Abort navigation if teardown returns false
    }

    try {
        const response = await fetch(`${viewName}.html`);
        if (!response.ok) throw new Error(`Failed to load ${viewName}.html`);
        
        contentArea.innerHTML = await response.text();

        // Attach listener for backup button if it exists in the new view
        const backupBtn = document.getElementById('backup-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', handleBackupAndReset);
        }
        // Update UI status when view loads to reflect current dirty state
        updateGlobalDirtyStatusUI();

        currentView = viewName;
        currentViewTeardown = null; // Reset for the new view
        
        // Update active nav button
        document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`nav-${viewName}`).classList.add('active');
        
        // Run the setup function for the loaded view if it exists
        if (viewInitializers[viewName]) {
            // The setup function can return a "teardown" function
            currentViewTeardown = viewInitializers[viewName]();
        }

    } catch (error) {
        console.error(`Error loading view: ${viewName}`, error);
        contentArea.innerHTML = `<p>Error loading module. Please check the console.</p>`;
    }
}

// --- System Settings View ---
function setupSystemView() {
    const dom = {
        form: document.getElementById('user-info-form'),
        inputs: document.querySelectorAll('#user-info-form input[id]'),
        editBtn: document.getElementById('edit-user-info-btn'),
        saveBtn: document.getElementById('save-user-info-btn'),
        cancelBtn: document.getElementById('cancel-edit-btn'),
        status: document.getElementById('user-info-status'),
    };

    const moduleName = 'system';
    let originalData = {}; // To store the initial state for dirty checking

    function showStatus(message, isError = false, duration = 3000) {
        if (!dom.status) return;
        dom.status.textContent = message;
        dom.status.style.color = isError ? 'var(--danger-color)' : 'green';
        dom.status.style.display = 'block';
        setTimeout(() => { dom.status.style.display = 'none'; }, duration);
    }

    // Gets current data from the form fields
    function getFormData() {
        const data = {};
        dom.inputs.forEach(input => {
            const key = input.id.replace('user-', '');
            data[key] = input.value;
        });
        return data;
    }

    // Compares current form data to the originally loaded data
    function isFormDirty() {
        const currentData = getFormData();
        // An unsaved form is dirty if any value differs from the original
        return Object.keys(originalData).some(key => originalData[key] !== currentData[key]);
    }

    // Toggles the UI between viewing and editing states
    function setEditMode(isEditing) {
        dom.inputs.forEach(input => (input.disabled = !isEditing));
        dom.editBtn.style.display = isEditing ? 'none' : 'block';
        dom.saveBtn.style.display = isEditing ? 'block' : 'none';
        dom.cancelBtn.style.display = isEditing ? 'block' : 'none';

        if (isEditing && dom.inputs.length > 0) {
            dom.inputs[0].focus(); // Focus the first input field for better UX
        }
    }

    async function loadUserData() {
        try {
            originalData = {}; // Clear previous original data
            // Create a promise for each field to be loaded from the data store
            const loadPromises = Array.from(dom.inputs).map(async (input) => {
                const key = input.id.replace('user-', '');
                // Await each item individually
                const value = await dataManager.getItem(moduleName, key) || '';
                input.value = value;
                originalData[key] = value; // Store the pristine value
            });
            await Promise.all(loadPromises); // Wait for all fields to load
            setEditMode(false);
        } catch (error) {
            console.error('Failed to load user data:', error);
            showStatus('Error loading user data.', true);
        }
    }

    async function handleSave() {
        const currentData = getFormData();
        try {
            // Create a promise for each field to be saved
            const savePromises = Object.entries(currentData).map(([key, value]) => {
                return dataManager.setItem(moduleName, key, value.trim());
            });
            await Promise.all(savePromises); // Wait for all fields to be saved

            originalData = { ...currentData }; // Update the original data to the new saved state
            showStatus('User information saved successfully!');

            // Set the global dirty flag and update UI
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();

            setEditMode(false);
        } catch (error) {
            console.error('Failed to save user data:', error);
            showStatus(`Error saving data: ${error.message}`, true);
        }
    }

    function handleCancel() {
        // Revert form to original data without a network request
        dom.inputs.forEach(input => {
            const key = input.id.replace('user-', '');
            input.value = originalData[key] || '';
        });
        setEditMode(false);
    }

    // Attach Event Listeners
    dom.editBtn.addEventListener('click', () => setEditMode(true));
    dom.cancelBtn.addEventListener('click', handleCancel);
    dom.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSave();
    });

    // Initial Load
    loadUserData();

    // Return a "teardown" function to be called before navigating away
    return () => {
        if (isFormDirty()) {
            return confirm('You have unsaved changes in User Information. Are you sure you want to leave?');
        }
        return true; // OK to navigate
    };
}

// --- Program Settings View ---
function setupProgramView() {
    setupDataManagement();
    setupStyleManagement();
}

function setupDataManagement() {
    const dom = {
        moduleInput: document.getElementById('module-input'),
        moduleList: document.getElementById('module-list'),
        keyInput: document.getElementById('key-input'),
        keyList: document.getElementById('key-list'),
        valueInput: document.getElementById('value-input'),
        setItemBtn: document.getElementById('set-item-btn'),
        deleteItemBtn: document.getElementById('delete-item-btn'),
        fetchBtn: document.getElementById('fetch-btn'),
        clearBtn: document.getElementById('clear-btn'),
        treeContainer: document.getElementById('data-display-tree'),
        exportBtn: document.getElementById('export-btn'),
        importBtn: document.getElementById('import-btn'),
        importFileInput: document.getElementById('import-file-input'),
        statusIndicator: document.getElementById('data-status-indicator'),
    };

    let allData = {}; // Store the data locally for this view's UI

    // --- UI Update Functions ---
    async function refreshDisplay() {
        try {
            const store = await dataManager.getAllItems();
            
            // Separate schema from data for processing
            const schema = store._schema || {};
            allData = { ...store };
            delete allData._schema;

            // Update UI labels from schema, with sensible defaults
            const labels = schema.labels || {};
            const moduleLabel = labels.module || 'Module';
            const keyLabel = labels.key || 'Key';
            const valueLabel = labels.value || 'Item';

            if (dom.moduleInput) dom.moduleInput.placeholder = `Select or type new ${moduleLabel}`;
            if (dom.keyInput) dom.keyInput.placeholder = `Select or type new ${keyLabel}`;
            if (dom.valueInput) dom.valueInput.placeholder = `${valueLabel} Value`;
            
            // Render the new tree view
            renderTreeView(allData, labels);

            // Update the datalists with the actual data
            populateModuleDatalist();
            populateKeyDatalist();

        } catch (error) {
            console.error('Failed to refresh display:', error);
            if (dom.treeContainer) dom.treeContainer.innerHTML = '<p>Error loading data.</p>';
        }
    }

    function renderTreeView(data, labels) {
        if (!dom.treeContainer) return;
        dom.treeContainer.innerHTML = ''; // Clear previous tree
        if (Object.keys(data).length === 0) {
            dom.treeContainer.textContent = '[No data in store]';
            return;
        }
        const rootUl = document.createElement('ul');
        buildTree(data, rootUl, labels);
        dom.treeContainer.appendChild(rootUl);
    }

    function buildTree(data, parentElement, labels) {
        // Level 0: Iterate through Modules
        for (const moduleName in data) {
            const moduleObject = data[moduleName];
            const moduleLi = document.createElement('li');

            const toggle = document.createElement('span');
            toggle.className = 'tree-toggle expanded'; // Start expanded
            moduleLi.appendChild(toggle);

            // Create and append the module name to avoid overwriting the toggle span
            const moduleLabel = labels.module || 'Module';
            const moduleTitle = document.createElement('span');
            moduleTitle.innerHTML = `<span class="tree-key">${moduleLabel}: </span><span class="tree-value">"${moduleName}"</span>`;
            moduleLi.appendChild(moduleTitle);
            
            const keyUl = document.createElement('ul');
            // Level 1: Iterate through Keys and Items
            for (const keyName in moduleObject) {
                const itemValue = moduleObject[keyName];
                const keyLi = document.createElement('li');
                const keyLabel = labels.key || 'Key';
                // Use JSON.stringify to correctly handle quotes and different data types in the value
                const valueString = JSON.stringify(itemValue);
                keyLi.innerHTML = `<span class="tree-key">${keyLabel}: ${keyName}</span>: <span class="tree-value">${valueString}</span>`;
                keyUl.appendChild(keyLi);
            }

            moduleLi.appendChild(keyUl);
            parentElement.appendChild(moduleLi);
        }
    }

    function populateModuleDatalist() {
        if (!dom.moduleList) return;
        dom.moduleList.innerHTML = ''; // Clear existing options
        Object.keys(allData).forEach(moduleName => {
            const option = document.createElement('option');
            option.value = moduleName;
            dom.moduleList.appendChild(option);
        });
    }

    function populateKeyDatalist() {
        if (!dom.keyList || !dom.moduleInput) return;
        const selectedModule = dom.moduleInput.value;
        dom.keyList.innerHTML = ''; // Clear existing options
        if (allData[selectedModule]) {
            Object.keys(allData[selectedModule]).forEach(keyName => {
                const option = document.createElement('option');
                option.value = keyName;
                dom.keyList.appendChild(option);
            });
        }
    }

    function populateValueInput() {
        if (!dom.moduleInput || !dom.keyInput || !dom.valueInput) return;
        const selectedModule = dom.moduleInput.value;
        const selectedKey = dom.keyInput.value;
        if (allData[selectedModule] && allData[selectedModule][selectedKey] !== undefined) {
            dom.valueInput.value = allData[selectedModule][selectedKey];
        }
    }

    // --- Handlers ---
    async function handleSetItem() {
        const module = dom.moduleInput.value.trim();
        const key = dom.keyInput.value.trim();
        const value = dom.valueInput.value.trim();
        if (!module || !key) {
            alert('Module and Key are required.');
            return;
        }
        try {
            await dataManager.setItem(module, key, value);
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            await refreshDisplay();
        } catch (error)
        {
            console.error('Failed to set item:', error);
            alert(`Error setting item: ${error.message}`);
        }
    }

    async function handleDeleteItem() {
        const module = dom.moduleInput.value.trim();
        const key = dom.keyInput.value.trim();

        if (!module || !key) {
            alert('Module and Key are required to delete an item.');
            return;
        }

        if (confirm(`Are you sure you want to delete the key "${key}" from module "${module}"?`)) {
            try {
                await dataManager.deleteItem(module, key);
                globalState.isDirty = true;
                updateGlobalDirtyStatusUI();
                // Clear inputs after successful deletion
                dom.keyInput.value = '';
                dom.valueInput.value = '';
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
                globalState.isDirty = true;
                updateGlobalDirtyStatusUI();
                await refreshDisplay();
            } catch (error) {
                console.error('Failed to clear items:', error);
                alert('Error clearing data.');
            }
        }
    }

    async function handleLoadFromJson() {
        const file = dom.importFileInput.files[0];
        if (!file) return;
        try {
            await dataManager.loadDataFromJson(file);
            globalState.isDirty = false;
            updateGlobalDirtyStatusUI();
            await refreshDisplay();
            alert('Data loaded successfully!');
        } catch (error) {
            alert(`Failed to load data: ${error.message}`);
        } finally {
            dom.importFileInput.value = ''; // Reset file input
        }
    }

    // --- Event Listeners ---
    function attachEventListeners() {
        if (dom.setItemBtn) dom.setItemBtn.addEventListener('click', handleSetItem);
        if (dom.deleteItemBtn) dom.deleteItemBtn.addEventListener('click', handleDeleteItem);
        if (dom.treeContainer) {
            dom.treeContainer.addEventListener('click', (event) => {
                if (event.target.classList.contains('tree-toggle')) {
                    const parentLi = event.target.parentElement;
                    const sublist = parentLi.querySelector('ul');
                    if (sublist) {
                        event.target.classList.toggle('expanded');
                        sublist.style.display = sublist.style.display === 'none' ? 'block' : 'none';
                    }
                }
            });
        }
        if (dom.fetchBtn) dom.fetchBtn.addEventListener('click', refreshDisplay);
        if (dom.moduleInput) dom.moduleInput.addEventListener('input', populateKeyDatalist);
        if (dom.keyInput) dom.keyInput.addEventListener('input', populateValueInput);
        if (dom.clearBtn) dom.clearBtn.addEventListener('click', handleClearAll);
        if (dom.exportBtn) dom.exportBtn.addEventListener('click', handleExportOnly);
        if (dom.importBtn) dom.importBtn.addEventListener('click', () => dom.importFileInput.click());
        if (dom.importFileInput) dom.importFileInput.addEventListener('change', handleLoadFromJson);
    }

    // --- Initialization ---
    attachEventListeners();
    updateGlobalDirtyStatusUI(); // Set initial status
    refreshDisplay(); // Initial data load for this view

    // Return a "teardown" function for consistency with the navigation guard pattern
    return () => {
        if (globalState.isDirty) {
            return confirm('You have unsaved changes in the Data Store. Are you sure you want to leave?');
        }
        return true; // OK to navigate
    };
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
            const isExpanded = navGroup.classList.toggle('expanded');
            settingsToggle.setAttribute('aria-expanded', isExpanded);
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
