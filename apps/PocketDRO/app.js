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
    // We get the data blob from the manager, but override the filename for consistency.
    const { blob } = await dataManager.getExportableJson();
    const filename = 'datastore.json';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Handles the BACKUP process by exporting data and resetting the dirty state.
 */
async function handleBackupAndReset() {
    await handleExportOnly(); // Reuse export logic
    globalState.isDirty = false;
    updateGlobalDirtyStatusUI();
}

/**
 * Handles the global IMPORT process by reading a file, loading it via the dataManager,
 * and then reloading the current view to reflect the changes.
 * @param {Event} event - The file input change event.
 */
async function handleGlobalImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Get a reference to the input element to clear it later.
    const fileInput = event.target;

    try {
        await dataManager.loadDataFromJson(file);
        globalState.isDirty = false; // After a successful load, the data is in sync

        if (fileInput) {
            fileInput.value = '';
        }

        // Reload the current view to reflect the new data from the imported file.
        const viewToReload = currentView;
        currentView = null; // Force a reload by clearing the current view state
        
        // Create a callback to show the success message AFTER the view has reloaded.
        const showSuccessMessage = () => {
            const statusEl = document.getElementById('file-actions-status');
            if (statusEl) {
                statusEl.textContent = 'Data loaded successfully!';
                statusEl.classList.remove('hidden');
                statusEl.style.color = 'green';
                setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);
            }
        };

        await loadView(viewToReload, showSuccessMessage);

    } catch (error) {
        // Re-throw the error to be caught by the calling event listener
        throw error;
    }
}

// Map view names to their setup functions for scalability
const viewInitializers = {
    'program': setupProgramView,
    'system': setupSystemView,
};

async function loadView(viewName, onLoadCallback = null) {
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

        // Run the post-load callback if it exists
        if (onLoadCallback) {
            onLoadCallback();
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

        // New buttons for user data import/export
        userSaveToFileBtn: document.getElementById('user-save-to-file-btn'),
        userLoadFromFileInput: document.getElementById('user-load-from-file-input'),
        fileActionsStatus: document.getElementById('file-actions-status'),

        // Project section elements
        projectSelector: document.getElementById('project-selector'),
        projectDetailsForm: document.getElementById('project-details-form'),
        projectStatus: document.getElementById('project-status'), // now a select
        projectStartDate: document.getElementById('project-start-date'), // now an input
        projectEndDate: document.getElementById('project-end-date'), // now an input
        projectInputs: document.querySelectorAll('#project-details-form input, #project-details-form select'),
        editProjectBtn: document.getElementById('edit-project-btn'),
        saveProjectBtn: document.getElementById('save-project-btn'),
        cancelProjectBtn: document.getElementById('cancel-project-btn'),
        addProjectBtn: document.getElementById('add-project-btn'),

        // Modal elements are global but managed here
        addProjectModal: document.getElementById('add-project-modal'),
        addProjectForm: document.getElementById('add-project-form'),
        modalCloseBtn: document.getElementById('modal-close-btn'),
        modalCancelBtn: document.getElementById('modal-cancel-btn'),
    };

    const moduleName = 'system';
    let originalData = {}; // To store the initial state for dirty checking
    let allProjects = {};
    let activeProjectName = null;
    let originalProjectData = {}; // For canceling project edits

    function showStatus(message, isError = false, duration = 3000) {
        if (!dom.status) return;
        dom.status.textContent = message;
        dom.status.classList.remove('hidden');
        dom.status.style.color = isError ? 'var(--danger-color)' : 'green';
        setTimeout(() => { dom.status.classList.add('hidden'); }, duration);
    }

    function showFileActionStatus(message, isError = false, duration = 3000) {
        if (!dom.fileActionsStatus) return;
        dom.fileActionsStatus.textContent = message;
        dom.fileActionsStatus.classList.remove('hidden');
        dom.fileActionsStatus.style.color = isError ? 'var(--danger-color)' : 'green';
        setTimeout(() => { dom.fileActionsStatus.classList.add('hidden'); }, duration);
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
        // Hide the "Edit" button when in edit mode
        dom.editBtn.classList.toggle('hidden', isEditing);
        // Instead of hiding, we will enable/disable the Save/Cancel buttons
        dom.saveBtn.disabled = !isEditing;
        dom.cancelBtn.disabled = !isEditing;

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
            const savePromises = Object.entries(currentData).map(([key, formValue]) => {
                return dataManager.setItem(moduleName, key, formValue.trim());
            });
            await Promise.all(savePromises); // Wait for all fields to be saved

            originalData = { ...currentData }; // Update the original data to the new saved state
            showStatus('User data saved successfully!');

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

    function setProjectEditMode(isEditing) {
        if (!dom.projectInputs) return;
        dom.projectInputs.forEach(input => input.disabled = !isEditing);
        dom.editProjectBtn.classList.toggle('hidden', isEditing);
        dom.saveProjectBtn.disabled = !isEditing;
        dom.cancelProjectBtn.disabled = !isEditing;
        // Disable project selector and add button while editing
        dom.projectSelector.disabled = isEditing;
        dom.addProjectBtn.disabled = isEditing;

        if (isEditing) {
            dom.projectStatus.focus();
        }
    }

    function updateProjectDetails(projectName) {
        if (!dom.projectDetailsForm) return;
        setProjectEditMode(false); // Always reset edit mode on change

        if (!projectName) {
            dom.projectDetailsForm.classList.add('hidden');
            return;
        }

        const project = allProjects[projectName];
        if (project) {
            dom.projectStatus.value = project.status || 'Not Started';
            dom.projectStartDate.value = project.startDate || '';
            dom.projectEndDate.value = project.endDate || '';

            // Store for cancellation
            originalProjectData = { ...project };

            dom.projectDetailsForm.classList.remove('hidden');
        } else {
            dom.projectDetailsForm.classList.add('hidden');
        }
    }

    async function handleProjectSave() {
        const selectedName = dom.projectSelector.value;

        if (!allProjects[selectedName]) {
            showStatus('No project selected to save.', true);
            return;
        }

        // Create the updated project object from form fields
        const updatedProject = {
            ...allProjects[selectedName], // Keep original properties, including name
            status: dom.projectStatus.value,
            startDate: dom.projectStartDate.value,
            endDate: dom.projectEndDate.value,
        };

        // Prepare just the details for saving (without the 'name' property which is for internal UI use).
        const { name, ...detailsToSave } = updatedProject;

        try {
            // Save only the updated project under its name as the key.
            // This is more granular and aligns with the key-value nature of the data store.
            await dataManager.setItem('projects', selectedName, detailsToSave);

            // If save is successful, update the main in-memory state.
            allProjects[selectedName] = updatedProject;
            originalProjectData = { ...updatedProject }; // Update original data for cancel functionality

            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus('Project details saved.');
            setProjectEditMode(false);
        } catch (error) {
            console.error('Failed to save project:', error);
            showStatus('Error saving project.', true);
            // No need to revert, as `allProjects` was not modified until after the successful save.
        }
    }

    function handleProjectCancelEdit() {
        // Revert form from stored original data
        if (originalProjectData.name) {
            dom.projectStatus.value = originalProjectData.status || 'Not Started';
            dom.projectStartDate.value = originalProjectData.startDate || '';
            dom.projectEndDate.value = originalProjectData.endDate || '';
        }
        setProjectEditMode(false);
    }

    async function loadProjectData() {
        if (!dom.projectSelector) return;
        try {
            // Get all data from the store and select the 'projects' module.
            const allData = await dataManager.getAllItems();
            const projectsFromStore = allData.projects || {};

            // The data structure from the store is already flat. We just need to add the 'name' property
            // to each project object for internal consistency in the `allProjects` map.
            allProjects = {};
            Object.entries(projectsFromStore).forEach(([projectName, projectDetails]) => {
                allProjects[projectName] = {
                    name: projectName,
                    ...(typeof projectDetails === 'object' && projectDetails !== null ? projectDetails : {}),
                };
            });

            // The active project name is stored in the 'system' module.
            activeProjectName = await dataManager.getItem('system', 'activeProjectName');

            // Populate dropdown
            dom.projectSelector.innerHTML = ''; // Clear existing
            const noneOption = document.createElement('option');
            noneOption.value = '';
            noneOption.textContent = '-- Select a Project --';
            dom.projectSelector.appendChild(noneOption);

            // Populate the dropdown from the `allProjects` object
            Object.values(allProjects).forEach(project => {
                const option = document.createElement('option');
                option.value = project.name;
                option.textContent = project.name;
                if (project.name === activeProjectName) {
                    option.selected = true;
                }
                dom.projectSelector.appendChild(option);
            });

            // Show details for the initially loaded project
            updateProjectDetails(activeProjectName);
        } catch (error) {
            console.error('Failed to load project data:', error);
            showStatus('Error loading project data.', true);
        }
    }

    async function handleProjectChange() {
        const selectedName = dom.projectSelector.value;
        updateProjectDetails(selectedName); // This will now populate the form and reset edit mode

        if (selectedName === activeProjectName) return; // No change to save

        try {
            await dataManager.setItem('system', 'activeProjectName', selectedName);
            activeProjectName = selectedName; // Update local state
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus('Active project updated.');
        } catch (error) {
            console.error('Failed to save active project:', error);
            showStatus('Error saving active project.', true);
        }
    }

    // --- Modal Functions ---
    function openAddProjectModal() {
        if (dom.addProjectModal) {
            dom.addProjectForm.reset();
            dom.addProjectModal.classList.add('active');
            document.getElementById('new-project-name').focus();
        }
    }

    function closeAddProjectModal() {
        if (dom.addProjectModal) {
            dom.addProjectModal.classList.remove('active');
        }
    }

    async function handleAddProjectSave(e) {
        e.preventDefault();
        const newName = document.getElementById('new-project-name').value.trim();
        if (!newName) {
            alert('Project Name is required.');
            return;
        }
        // Enforce uniqueness for new projects
        if (allProjects[newName]) {
            alert(`A project named "${newName}" already exists. Please choose a unique name.`);
            return;
        }

        const newProjectDetails = {
            startDate: document.getElementById('new-project-start-date').value,
            endDate: document.getElementById('new-project-end-date').value,
            status: document.getElementById('new-project-status').value,
        };

        try {
            // Save all data changes to the persistent store first.
            // Save just the new project details under the new name as the key.
            await dataManager.setItem('projects', newName, newProjectDetails);
            await dataManager.setItem('system', 'activeProjectName', newName);

            // --- If save is successful, simply reload all project data to refresh the UI ---
            await loadProjectData(); // This will rebuild the dropdown and select the new project.

            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus('New project added successfully.');
            closeAddProjectModal();
        } catch (error) {
            console.error('Failed to add project:', error);
            showStatus('Error adding project.', true);
        }
    }

    // Attach Event Listeners
    dom.editBtn.addEventListener('click', () => setEditMode(true));
    dom.cancelBtn.addEventListener('click', handleCancel);
    dom.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSave();
    });

    // User Data File Listeners
    if (dom.userSaveToFileBtn) {
        dom.userSaveToFileBtn.addEventListener('click', async () => {
            try {
                await handleExportOnly();
                showFileActionStatus('File saved successfully.');
            } catch (error) {
                console.error('Failed to export data:', error);
                showFileActionStatus('Error exporting data.', true);
            }
        });
    }
    if (dom.userLoadFromFileInput) {
        dom.userLoadFromFileInput.addEventListener('change', async (event) => {
            try {
                await handleGlobalImport(event);
            } catch (error) {
                console.error('Failed to import data:', error);
                showFileActionStatus(`Error: ${error.message}`, true, 5000);
            }
        });
    }
    
    // Project Listeners
    if (dom.projectSelector) {
        dom.projectSelector.addEventListener('change', handleProjectChange);
    }
    if (dom.editProjectBtn) dom.editProjectBtn.addEventListener('click', () => setProjectEditMode(true));
    if (dom.cancelProjectBtn) dom.cancelProjectBtn.addEventListener('click', handleProjectCancelEdit);
    if (dom.projectDetailsForm) dom.projectDetailsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleProjectSave();
    });

    // Modal Listeners
    if (dom.addProjectBtn) dom.addProjectBtn.addEventListener('click', openAddProjectModal);
    if (dom.modalCloseBtn) dom.modalCloseBtn.addEventListener('click', closeAddProjectModal);
    if (dom.modalCancelBtn) dom.modalCancelBtn.addEventListener('click', closeAddProjectModal);
    if (dom.addProjectForm) dom.addProjectForm.addEventListener('submit', handleAddProjectSave);

    // Initial Load
    loadUserData();
    loadProjectData();

    // Return a "teardown" function to be called before navigating away
    return () => {
        if (isFormDirty()) {
            return confirm('You have unsaved changes for the User. Are you sure you want to leave?');
        }
        // We don't need a guard for project changes because they save immediately.
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
        if (dom.importFileInput) dom.importFileInput.addEventListener('change', handleGlobalImport);
    }

    // --- Initialization ---
    attachEventListeners();
    updateGlobalDirtyStatusUI(); // Set initial status
    refreshDisplay(); // Initial data load for this view

    // No teardown function is needed here. The global dirty status is indicated
    // in the UI, and blocking navigation is too intrusive for this state.
    return null;
}

function setupStyleManagement() {
    const container = document.getElementById('style-manager-container');
    if (container) {
        styleManager.renderUI(container);
    }
}

/**
 * Loads initial data from the server-side datastore.json, but only if the
 * local data store (localStorage) is empty. This prevents overwriting a
 * user's session data on subsequent visits.
 */
async function loadInitialData() {
    try {
        // First, check if there's already data in our local store.
        const existingData = await dataManager.getAllItems();
        const dataKeys = Object.keys(existingData).filter(k => k !== '_schema');

        if (dataKeys.length > 0) {
            console.log('Local storage already contains data. Skipping initial load from datastore.json.');
            // Do not overwrite the user's session. The app will proceed with the data from localStorage.
            return;
        }

        // If we are here, local storage is empty. Let's fetch the initial data file.
        console.log('Local storage is empty. Attempting to load initial data from datastore.json...');
        const response = await fetch('../../datastore.json'); // Path relative to index.html

        if (!response.ok) {
            if (response.status === 404) {
                console.log('datastore.json not found on server. Starting with a completely empty store.');
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return;
        }

        // We have the file, now load it using the dataManager, which expects a File object.
        const blob = await response.blob();
        const file = new File([blob], 'datastore.json', { type: 'application/json' });

        await dataManager.loadDataFromJson(file);
        
        // After a fresh load from the master file, the state is clean.
        globalState.isDirty = false;
        console.log('Successfully populated local storage from datastore.json.');

    } catch (error) {
        console.error('Could not load initial data from datastore.json:', error);
        alert('Warning: Could not load initial data from the server. The application will start with an empty data store.');
    }
}

// --- App Initialization ---
async function initializeApp() {
    if (settingsToggle) {
        settingsToggle.addEventListener('click', (e) => {
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

    // Load initial data from datastore.json if local storage is empty
    await loadInitialData();

    // Update the global UI status after initial data load attempt
    updateGlobalDirtyStatusUI();

    // Load the default view when the application starts
    loadView('bolt-hole-circle');
}

initializeApp();
