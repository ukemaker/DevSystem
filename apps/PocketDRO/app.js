import { dataManager } from '../../shared/dm.js';
import { styleManager } from '../../shared/sm.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// --- Main App Setup ---
const contentArea = document.getElementById('content-area');
const navButtons = {
    'bolt-hole-circle': document.getElementById('nav-bolt-hole-circle'),
    'line-holes': document.getElementById('nav-line-holes'),
    'arc-milling': document.getElementById('nav-arc-milling'),
    'calc-conv': document.getElementById('nav-calc-conv'),
    // Settings Submenu
    'system': document.getElementById('nav-system'),
    'machine': document.getElementById('nav-machine'),
    'display': document.getElementById('nav-display'),
    'print': document.getElementById('nav-print'),
    'program': document.getElementById('nav-program'),
};
const settingsToggle = document.getElementById('nav-settings-toggle');

let currentView = null;
console.log(`[Init] currentView initialized to: '${currentView}'`);
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
    const isDirty = globalState.isDirty;

    if (statusIndicator) {
        statusIndicator.textContent = isDirty ? 'Local storage has unsaved changes.' : 'Local storage is in sync.';
        statusIndicator.className = isDirty ? 'dirty' : 'synced';
    }
    if (backupBtn) {
        backupBtn.style.display = isDirty ? 'inline-block' : 'none';
    }
}

/**
 * Handles the EXPORT process by creating and downloading a file.
 * This function does NOT change the application's dirty state.
 */
async function handleExportOnly() {
    console.log(`[handleExportOnly] Creating and clicking download link.`);
    // We get the data blob from the manager, but override the filename for consistency.
    const { blob } = await dataManager.getExportableJson();
    const filename = 'datastore.json';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none'; // Keep it out of the visual layout
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // The download is initiated, but we must delay the cleanup.
    // Removing the element and revoking the URL immediately can cancel the download in some browsers.
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[handleExportOnly] Download link cleaned up.`);
    }, 150); // A 150ms delay is generally safe.
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

    await dataManager.loadDataFromJson(file);
    globalState.isDirty = false; // After a successful load, the data is in sync

    if (fileInput) {
        fileInput.value = '';
    }
}

// Map view names to their setup functions for scalability
const viewInitializers = {
    'program': setupProgramView,
    'system': setupSystemView,
    'machine': setupMachineView,
};

async function loadView(viewName, onLoadCallback = null) {
    console.log(`[loadView] START. Attempting to load view: '${viewName}'. Current view is: '${currentView}'.`);
    // Allow reloading if currentView was explicitly set to null to force it
    if (currentView === viewName && currentView !== null) {
        console.log(`[loadView] END. View '${viewName}' is already current. Aborting.`);
        return;
    }

    // Navigation Guard: Check if we can leave the current view
    if (currentViewTeardown) {
        console.log(`[loadView] Running teardown for '${currentView}'. Current view is: '${currentView}'.`);
        if (!currentViewTeardown()) {
            console.warn(`[loadView] Navigation away from '${currentView}' was blocked by its teardown function. Current view is: '${currentView}'.`);
            // If we nulled out currentView to force a reload but were blocked, restore it.
            if (currentView === null) currentView = viewName;
            return; // Abort navigation
        }
    }

    try {
        const response = await fetch(`${viewName}.html`);
        if (!response.ok) throw new Error(`Failed to load ${viewName}.html`);
        
        // Set the current view state immediately after a successful fetch.
        // This makes the application state consistent even if subsequent setup fails.
        currentView = viewName;
        sessionStorage.setItem('lastActiveView', viewName);
        console.log(`%c[loadView] State Update. currentView is now: '${currentView}'. Saved to sessionStorage.`, 'color: green; font-weight: bold;');

        contentArea.innerHTML = await response.text();

        // Attach listener for backup button if it exists in the new view
        const backupBtn = document.getElementById('backup-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', handleBackupAndReset);
        }
        // Update UI status when view loads to reflect current dirty state
        updateGlobalDirtyStatusUI();

        currentViewTeardown = null;
        console.log(`[loadView] Teardown reset. currentView is: '${currentView}'.`);
        
        // Update active nav button
        document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`nav-${viewName}`).classList.add('active');
        
        // Run the setup function for the loaded view if it exists
        if (viewInitializers[viewName]) {
            console.log(`[loadView] Initializing view '${viewName}'. currentView is: '${currentView}'.`);
            // The setup function can return a "teardown" function
            currentViewTeardown = viewInitializers[viewName]();
            console.log(`[loadView] View '${viewName}' initialized. currentView is: '${currentView}'.`);
        }

        // Run the post-load callback if it exists
        if (onLoadCallback) {
            onLoadCallback();
        }
    } catch (error) {
        console.error(`Error loading view: ${viewName}`, error);
        contentArea.innerHTML = `<p>Error loading module. Please check the console.</p>`;
    }
    console.log(`[loadView] END. Finished loading '${viewName}'. Current view is: '${currentView}'.`);
}

/**
 * Resets all user-modifiable data modules to their default states as defined in datastore.json.
 * This function reads the `default-*` modules and overwrites the corresponding active modules.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the reset was successful, 
 * `false` if the user cancelled, and rejects on error.
 */
async function handleResetToDefaults() {
    if (!confirm("Are you sure you want to reset all settings to their defaults? This will overwrite your current data and cannot be undone.")) {
        return false; // User cancelled the operation
    }

    try {
        const allData = await dataManager.getAllItems();
        // Start with a clean slate to ensure non-default data is removed.
        const newData = {};

        // Preserve the schema, if it exists.
        if (allData._schema) {
            newData._schema = JSON.parse(JSON.stringify(allData._schema));
        }

        let didReset = false;

        // Rebuild the data store by finding all 'default-*' modules.
        for (const defaultKey in allData) {
            if (defaultKey.startsWith('default-')) {
                // Derive the active module name from the default key.
                // This handles the 'default-machines' -> 'machine' exception.
                const activeKey = defaultKey === 'default-machines' 
                    ? 'machine' 
                    : defaultKey.replace('default-', '');

                // Copy the default data to the active module key and the default module itself.
                newData[activeKey] = JSON.parse(JSON.stringify(allData[defaultKey]));
                newData[defaultKey] = JSON.parse(JSON.stringify(allData[defaultKey]));
                didReset = true;
            }
        }

        if (!didReset) {
            throw new Error("No default data found to perform a reset.");
        }

        // Create a blob and file from the new data object to use the existing import logic.
        // This will overwrite the entire localStorage with our newly constructed data.
        const blob = new Blob([JSON.stringify(newData)], { type: 'application/json' });
        const file = new File([blob], 'reset-data.json', { type: 'application/json' });
        
        await dataManager.loadDataFromJson(file);
        globalState.isDirty = true; // The store has changed and is now out of sync with any saved file.
        updateGlobalDirtyStatusUI();
        return true; // Indicate success
    } catch (error) {
        console.error('Failed to reset data to defaults:', error);
        throw error; // Re-throw to be caught by the caller
    }
}
// --- System Settings View ---
function setupSystemView() {
    console.log(`[setupSystemView] START. currentView is: '${currentView}'.`);
    const dom = {
        form: document.getElementById('user-info-form'),
        inputs: document.querySelectorAll('#user-info-form input[id]'),
        editBtn: document.getElementById('edit-user-info-btn'),
        saveBtn: document.getElementById('save-user-info-btn'),
        cancelBtn: document.getElementById('cancel-user-edit-btn'),
        status: document.getElementById('user-info-status'),

        // Backup and Restore elements
        backupDataBtn: document.getElementById('backup-data-btn'),
        restoreDataInput: document.getElementById('restore-data-input'),
        resetDefaultsBtn: document.getElementById('reset-defaults-btn'),
        backupStatus: document.getElementById('backup-status'),

        // Project section elements
        projectSelector: document.getElementById('project-selector'),
        projectDetailsForm: document.getElementById('project-details-form'),
        projectStatus: document.getElementById('project-status'), // now a select
        projectStartDate: document.getElementById('project-start-date'), // now an input
        projectEndDate: document.getElementById('project-end-date'), // now an input
        projectDescription: document.getElementById('project-description'),
        projectInputs: document.querySelectorAll('#project-details-form input, #project-details-form select, #project-details-form textarea'),
        editProjectBtn: document.getElementById('edit-project-btn'),
        saveProjectBtn: document.getElementById('save-project-btn'),
        cancelProjectBtn: document.getElementById('cancel-project-btn'),
        deleteProjectBtn: document.getElementById('delete-project-btn'),
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

    // Generic status message helper
    function showStatusMessage(element, message, isError = false, duration = 3000) {
        if (!element) return;
        element.textContent = message;
        element.classList.remove('hidden');
        element.style.color = isError ? 'var(--danger-color)' : 'green';
        setTimeout(() => { element.classList.add('hidden'); }, duration);
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
        const dirty = Object.keys(originalData).some(key => {
            // Use strict inequality to avoid type coercion issues (e.g., 5 != "5" is false).
            return String(originalData[key]) !== String(currentData[key]);
        });
        return dirty;
    }

    // Toggles the UI between viewing and editing states
    function setEditMode(isEditing) {
        dom.inputs.forEach(input => (input.disabled = !isEditing));        
        // Toggle visibility of buttons
        dom.editBtn.hidden = isEditing;
        dom.saveBtn.hidden = !isEditing;
        dom.cancelBtn.hidden = !isEditing;

        // Enable/disable buttons
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
            showStatusMessage(dom.status, 'Error loading user data.', true);
        }
    }

    // Saves the user form data to the data store and resets its dirty state.
    async function saveUserForm() {
        const currentData = getFormData();
        const savePromises = Object.entries(currentData).map(([key, formValue]) => {
            return dataManager.setItem(moduleName, key, formValue.trim());
        });
        await Promise.all(savePromises);
        originalData = { ...currentData }; // Update the pristine state
        globalState.isDirty = true;
        updateGlobalDirtyStatusUI();
    }

    async function handleSave() {
        try {
            await saveUserForm();
            showStatusMessage(dom.status, 'User data saved successfully!');
            setEditMode(false);
        } catch (error) {
            console.error('Failed to save user data:', error);
            showStatusMessage(dom.status, `Error saving data: ${error.message}`, true);
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

        // Toggle visibility of buttons
        dom.editProjectBtn.hidden = isEditing;
        dom.saveProjectBtn.hidden = !isEditing;
        dom.cancelProjectBtn.hidden = !isEditing;
        dom.deleteProjectBtn.hidden = !isEditing;

        // Enable/disable buttons
        dom.saveProjectBtn.disabled = !isEditing;
        dom.cancelProjectBtn.disabled = !isEditing;
        dom.deleteProjectBtn.disabled = !isEditing;

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
            dom.projectDescription.value = project.description || '';

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
            showStatusMessage(dom.status, 'No project selected to save.', true);
            return;
        }

        // Create the updated project object from form fields
        const updatedProject = {
            ...allProjects[selectedName], // Keep original properties, including name
            status: dom.projectStatus.value,
            startDate: dom.projectStartDate.value,
            endDate: dom.projectEndDate.value,
            description: dom.projectDescription.value.trim(),
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
            showStatusMessage(dom.status, 'Project details saved.');
            setProjectEditMode(false);
        } catch (error) {
            console.error('Failed to save project:', error);
            showStatusMessage(dom.status, 'Error saving project.', true);
            // No need to revert, as `allProjects` was not modified until after the successful save.
        }
    }

    function handleProjectCancelEdit() {
        // Revert form from stored original data
        if (originalProjectData.name) {
            dom.projectStatus.value = originalProjectData.status || 'Not Started';
            dom.projectStartDate.value = originalProjectData.startDate || '';
            dom.projectEndDate.value = originalProjectData.endDate || '';
            dom.projectDescription.value = originalProjectData.description || '';
        }
        setProjectEditMode(false);
    }

    async function handleProjectDelete() {
        const selectedName = dom.projectSelector.value;
        if (!selectedName) {
            showStatusMessage(dom.status, 'No project selected to delete.', true);
            return;
        }

        if (!confirm(`Are you sure you want to delete the project "${selectedName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            // Use the generic deleteItem from dataManager
            await dataManager.deleteItem('projects', selectedName);

            // If the deleted project was the active one, we need to pick a new active project.
            if (activeProjectName === selectedName) {
                // Get the remaining projects AFTER deletion
                delete allProjects[selectedName];
                const remainingProjectNames = Object.keys(allProjects);
                const newActiveProjectName = remainingProjectNames.length > 0 ? remainingProjectNames[0] : ''; // Default to first or empty
                
                // Update the active project in the data store
                await dataManager.setItem('system', 'activeProjectName', newActiveProjectName);
            }

            // Refresh the entire project UI. This will rebuild the selector and update details.
            await loadProjectData();

            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatusMessage(dom.status, `Project "${selectedName}" deleted successfully.`);
        } catch (error) {
            console.error('Failed to delete project:', error);
            showStatusMessage(dom.status, 'Error deleting project.', true);
        }
    }

    async function loadProjectData() {
        if (!dom.projectSelector) return;
        try {
            // Get all data from the store and select the 'projects' module.
            const allData = await dataManager.getAllItems();
            const projectsFromStore = allData.projects || {};

            allProjects = {};
            Object.entries(projectsFromStore).forEach(([projectName, projectDetails]) => {
                const details = (typeof projectDetails === 'object' && projectDetails !== null) ? projectDetails : {};
                // Normalize the project object to guarantee a consistent shape.
                // This prevents errors from missing properties (e.g., 'description').
                allProjects[projectName] = {
                    // 1. Establish a default structure for all projects.
                    description: '',
                    status: 'Not Started',
                    startDate: '',
                    endDate: '',
                    // 2. Spread the actual data, overwriting defaults.
                    ...details,
                    // 3. Ensure the name is always set correctly, as it's used as the key.
                    name: projectName,
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
            showStatusMessage(dom.status, 'Error loading project data.', true);
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
            showStatusMessage(dom.status, 'Active project updated.');
        } catch (error) {
            console.error('Failed to save active project:', error);
            showStatusMessage(dom.status, 'Error saving active project.', true);
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
            description: document.getElementById('new-project-description').value.trim(),
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
            showStatusMessage(dom.status, 'New project added successfully.');
            closeAddProjectModal();
        } catch (error) {
            console.error('Failed to add project:', error);
            showStatusMessage(dom.status, 'Error adding project.', true);
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
    if (dom.backupDataBtn) {
        dom.backupDataBtn.addEventListener('click', async (event) => {
            console.log(`%c[Save To File] Process Started. currentView is: '${currentView}'.`, 'color: blue; font-weight: bold;');
            event.preventDefault(); // Prevent any default browser action
            event.stopPropagation(); // Stop the event from bubbling up
            try {
                // If the user form has pending changes, save them to the data store first
                // to ensure the exported file reflects what the user sees on screen.
                if (isFormDirty()) {
                    console.log('[Save To File] User form is dirty. Saving changes...');
                    await saveUserForm();
                    console.log('[Save To File] User form saved successfully.');
                } else {
                    console.log('[Save To File] User form is clean. No changes to save.');
                }

                // Now that the data store is fully up-to-date, export it.
                console.log('[Save To File] Exporting data to file...');
                await handleExportOnly();
                console.log('[Save To File] Export complete.');

                // The application state is now in sync with the saved file.
                console.log('[Save To File] Updating global state to clean.');
                globalState.isDirty = false;
                updateGlobalDirtyStatusUI(); // Update any relevant UI indicators
                showStatusMessage(dom.backupStatus, 'File saved and unsaved changes cleared.');
                console.log('%c[Save To File] Process Finished Successfully.', 'color: green; font-weight: bold;');
            } catch (error) {
                console.error('[Save To File] An error occurred during the process:', error);
                showStatusMessage(dom.backupStatus, 'Error exporting data.', true);
            }
        });
    }
    if (dom.restoreDataInput) {
        dom.restoreDataInput.addEventListener('change', async (event) => {
            if (!event.target.files || event.target.files.length === 0) return;
            try {
                await handleGlobalImport(event);
                currentView = null; // Force reload
                await loadView('system', () => {
                    // This callback runs after the new view is loaded
                    const statusEl = document.getElementById('backup-status');
                    if (statusEl) {
                        statusEl.textContent = 'Data restored successfully.';
                        statusEl.classList.remove('hidden');
                        statusEl.style.color = 'green';
                        setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);
                    }
                });
            } catch (error) {
                console.error('Failed to import data:', error);
                showStatusMessage(dom.backupStatus, `Error: ${error.message}`, true, 5000);
            }
        });
    }
    if (dom.resetDefaultsBtn) {
        dom.resetDefaultsBtn.addEventListener('click', async () => {
            try {
                const wasReset = await handleResetToDefaults();
                if (wasReset) {
                    currentView = null; // Force reload
                    await loadView('system', () => {
                        const statusEl = document.getElementById('backup-status');
                        if (statusEl) {
                            statusEl.textContent = 'Data has been reset to defaults.';
                            statusEl.classList.remove('hidden');
                            statusEl.style.color = 'green';
                            setTimeout(() => { statusEl.classList.add('hidden'); }, 3000);
                        }
                    });
                }
                // If wasReset is false, the user cancelled the confirm dialog, so do nothing.
            } catch (error) {
                showStatusMessage(dom.backupStatus, `Error resetting data: ${error.message}`, true, 5000);
            }
        });
    }
    
    // Project Listeners
    if (dom.projectSelector) {
        dom.projectSelector.addEventListener('change', handleProjectChange);
    }
    if (dom.editProjectBtn) {
        dom.editProjectBtn.addEventListener('click', () => setProjectEditMode(true));
    }
    if (dom.cancelProjectBtn) {
        dom.cancelProjectBtn.addEventListener('click', handleProjectCancelEdit);
    }
    if (dom.deleteProjectBtn) {
        dom.deleteProjectBtn.addEventListener('click', handleProjectDelete);
    }
    if (dom.projectDetailsForm) {
        dom.projectDetailsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleProjectSave();
        });
    }

    // Modal Listeners
    if (dom.addProjectBtn) dom.addProjectBtn.addEventListener('click', openAddProjectModal);
    if (dom.modalCloseBtn) dom.modalCloseBtn.addEventListener('click', closeAddProjectModal);
    if (dom.modalCancelBtn) dom.modalCancelBtn.addEventListener('click', closeAddProjectModal);
    if (dom.addProjectForm) dom.addProjectForm.addEventListener('submit', handleAddProjectSave);

    // Initial Load
    loadUserData();
    loadProjectData();
    console.log(`[setupSystemView] END. currentView is: '${currentView}'.`);

    // Return a "teardown" function to be called before navigating away
    return () => {
        console.log(`[Teardown Guard] Checking for unsaved changes in 'system' view.`);
        if (isFormDirty()) {
            console.warn(`[Teardown Guard] Form is dirty. Prompting user.`);
            return confirm('You have unsaved changes for the User. Are you sure you want to leave?');
        }
        console.log(`[Teardown Guard] Form is clean. Allowing navigation.`);
        // We don't need a guard for project changes because they save immediately or have their own cancel flow.
        return true; // OK to navigate away
    };
}

/**
 * Manages the three.js visualization for the machine settings.
 */
class MachineVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = null;
        this.labelRenderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.animationFrameId = null;
        this.sceneObjects = new THREE.Group(); // Group to hold all dynamic objects
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);
        this.scene.add(this.sceneObjects);

        // Camera
        const fov = 45;
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        const near = 0.1;
        const far = 1000;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this.camera.position.set(15, 15, 20);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Label Renderer
        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        this.labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through
        this.canvas.parentNode.appendChild(this.labelRenderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);

        // Start animation loop
        this.animate();
    }

    update(machineData) {
        // Clear previous objects
        while (this.sceneObjects.children.length) {
            this.sceneObjects.remove(this.sceneObjects.children[0]);
        }

        // Ensure travel dimensions are at least a small positive number for visualization stability.
        const xTravel = Math.max(machineData.xTravel, 0.001) || 1;
        const yTravel = Math.max(machineData.yTravel, 0.001) || 1;
        const zTravel = Math.max(machineData.zTravel, 0.001) || 1;

        // 1. Draw Travel Envelope
        // The box dimensions (width, height, depth) must match the world axes.
        // Machine X -> World X (width), Machine Z -> World Y (height), Machine Y -> World Z (depth).
        const envelopeGeom = new THREE.BoxGeometry(xTravel, zTravel, yTravel);
        const envelopeMaterial = new THREE.MeshBasicMaterial({ color: 0x007bff, transparent: true, opacity: 0.1 });
        const envelope = new THREE.Mesh(envelopeGeom, envelopeMaterial);
        const boxHelper = new THREE.BoxHelper(envelope, 0x007bff);
        this.sceneObjects.add(boxHelper);

        // 2. Draw Axes
        const axisLength = Math.max(xTravel, yTravel, zTravel) * 0.75;
        // Machine X-axis is defined as moving 'right' or 'left'.
        this.addAxis('X', new THREE.Vector3(machineData.positiveX === 'right' ? 1 : -1, 0, 0), axisLength, 0xff0000);
        // Machine Y-axis is defined as moving 'front' or 'back'. This maps to the world Z-axis.
        this.addAxis('Y', new THREE.Vector3(0, 0, machineData.positiveY === 'front' ? 1 : -1), axisLength, 0x00ff00);
        // Machine Z-axis is defined as moving 'up' or 'down'. This maps to the world Y-axis.
        this.addAxis('Z', new THREE.Vector3(0, machineData.positiveZ === 'up' ? 1 : -1, 0), axisLength, 0x0000ff);

        // 3. Draw Rotation Indicator
        this.addRotationIndicator(machineData, axisLength * 0.5);
    }

    addDimensionLabels(xTravel, yTravel, zTravel) {
        const createLabel = (text, position) => {
            const div = document.createElement('div');
            // Style directly for simplicity, but a class could also be used.
            div.textContent = text;
            div.style.color = '#333';
            div.style.fontSize = '12px';
            div.style.backgroundColor = 'rgba(255, 255, 255, 0.75)';
            div.style.padding = '2px 4px';
            div.style.borderRadius = '3px';

            const label = new CSS2DObject(div);
            label.position.copy(position);
            this.sceneObjects.add(label);
        };

        // The box is created with (width, height, depth) corresponding to (xTravel, zTravel, yTravel).
        const halfX = xTravel / 2;
        const halfY = yTravel / 2; // This is the world Z depth.
        const halfZ = zTravel / 2; // This is the world Y height.
        const offset = Math.max(xTravel, yTravel, zTravel) * 0.05; // Small offset to push labels away from the box

        // Place labels on the edges of the box for clarity.
        createLabel(`X: ${xTravel}`, new THREE.Vector3(0, -halfZ - offset, halfY)); // Bottom-front edge
        createLabel(`Y: ${yTravel}`, new THREE.Vector3(-halfX, -halfZ - offset, 0)); // Bottom-left edge
        createLabel(`Z: ${zTravel}`, new THREE.Vector3(-halfX, 0, halfY)); // Front-left edge
    }

    addAxis(label, dir, length, color) {
        const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, length * 0.1, length * 0.05);
        this.sceneObjects.add(arrow);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'axis-label';
        labelDiv.textContent = label;
        labelDiv.style.color = `#${color.toString(16).padStart(6, '0')}`;
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.fontSize = '16px';

        const axisLabel = new CSS2DObject(labelDiv);
        axisLabel.position.copy(dir).multiplyScalar(length * 1.05);
        this.sceneObjects.add(axisLabel);
    }

    frameScene() {
        if (this.sceneObjects.children.length === 0) return;

        const box = new THREE.Box3().setFromObject(this.sceneObjects);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        // Calculate the distance the camera needs to be to fit the object in view.
        let distance = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
        
        distance *= 1.5; // Add some padding so it doesn't touch the edges

        // Position camera at a nice diagonal angle from the center
        this.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
        this.controls.target.copy(center);
    }

    addRotationIndicator(data, radius) {
        const axisMap = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
        const zeroMap = {
            'pos-x': new THREE.Vector3(1, 0, 0), 'neg-x': new THREE.Vector3(-1, 0, 0),
            'pos-y': new THREE.Vector3(0, 1, 0), 'neg-y': new THREE.Vector3(0, -1, 0),
            'pos-z': new THREE.Vector3(0, 0, 1), 'neg-z': new THREE.Vector3(0, 0, -1),
        };

        const rotationAxis = axisMap[data.fourthAxis];
        if (!rotationAxis) return;

        const zeroVector = zeroMap[data.rotationZero];
        if (!zeroVector) return;

        // Check if zeroVector is parallel to rotationAxis. If so, can't draw arrow.
        if (Math.abs(zeroVector.dot(rotationAxis)) > 0.99) return;

        const rotationIndicatorGroup = new THREE.Group();

        const tubeRadius = radius * 0.03;
        const isLHR = data.positiveRotation === 'lhr';

        // 1. Create the arc geometry (a 90-degree segment)
        const curve = new THREE.ArcCurve(0, 0, radius, 0, Math.PI / 2, false);
        const arcGeom = new THREE.TubeGeometry(curve, 20, tubeRadius, 8, false);
        const arcMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const arcMesh = new THREE.Mesh(arcGeom, arcMat);

        // 2. Create the arrow helper at the start of the arc
        const arrowOrigin = new THREE.Vector3(radius, 0, 0); // Start of arc is on local X
        const arrowDirection = new THREE.Vector3(0, 1, 0);   // Tangent is along local Y
        const arrowLength = radius * 0.4;
        const arrow = new THREE.ArrowHelper(arrowDirection, arrowOrigin, arrowLength, 0xdc3545, arrowLength * 0.4, arrowLength * 0.2);

        rotationIndicatorGroup.add(arcMesh, arrow);

        // 3. Orient the entire group to match the machine settings
        // The group's local X-axis should align with `zeroVector`.
        // The group's local Z-axis should align with `rotationAxis`.
        const localZ = isLHR ? rotationAxis.clone().negate() : rotationAxis.clone();
        const localX = zeroVector.clone();
        const localY = new THREE.Vector3().crossVectors(localZ, localX); // Z x X = Y
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(localX, localY, localZ);
        rotationIndicatorGroup.quaternion.setFromRotationMatrix(matrix);

        this.sceneObjects.add(rotationIndicatorGroup);
    }

    dispose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.controls) {
            this.controls.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.labelRenderer && this.labelRenderer.domElement.parentNode) {
            this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
        }
        // You can add more cleanup for geometries and materials if needed
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }
}

// --- Machine Settings View ---
// --- Machine Settings View ---
function setupMachineView() {
    console.log(`[setupMachineView] START.`);
    // --- DOM Cache ---
    const dom = {
        // Machine selection
        selector: document.getElementById('machine-selector'),
        addBtn: document.getElementById('add-machine-btn'),
        deleteBtn: document.getElementById('delete-machine-btn'),

        // Form and controls
        form: document.getElementById('machine-details-form'),
        editBtn: document.getElementById('edit-machine-btn'),
        saveBtn: document.getElementById('save-machine-btn'),
        cancelBtn: document.getElementById('cancel-machine-edit-btn'),
        status: document.getElementById('machine-status'),

        // Form fields
        description: document.getElementById('machine-description'),
        inputUnits: document.getElementById('machine-input-units'),
        precision: document.getElementById('machine-precision'),
        angleUnits: document.getElementById('machine-angle-units'),
        positiveX: document.getElementById('machine-positive-x'),
        positiveY: document.getElementById('machine-positive-y'),
        positiveZ: document.getElementById('machine-positive-z'),
        xTravel: document.getElementById('machine-x-travel'),
        yTravel: document.getElementById('machine-y-travel'),
        zTravel: document.getElementById('machine-z-travel'),
        fourthAxis: document.getElementById('machine-fourth-axis'),
        positiveRotation: document.getElementById('machine-positive-rotation'),
        rotationZero: document.getElementById('machine-rotation-zero'),
        
        // Modal elements
        addModal: document.getElementById('add-machine-modal'),
        addForm: document.getElementById('add-machine-form'),
        modalCloseBtn: document.getElementById('machine-modal-close-btn'),
        modalCancelBtn: document.getElementById('machine-modal-cancel-btn'),
        canvas: document.getElementById('machine-visualization-canvas'),
    };

    // --- State Variables ---
    const allFormInputs = [
        ...dom.form.querySelectorAll('input, select, textarea'),
        dom.description,
    ];

    let allMachines = {};
    let activeMachineName = null;
    let originalMachineData = {};
    let previousLinearUnit = null; // Add this to track unit changes during an edit session.
    let visualizer = null;

    // --- Formatting and Conversion Utilities (Agnostic) ---

    // Helper to convert kebab-case strings to camelCase (e.g., 'positive-z' -> 'positiveZ')
    function kebabToCamel(s) {
        return s.replace(/-./g, x => x.charAt(1).toUpperCase());
    }

    const INCH_TO_MM = 25.4;

    /**
     * Converts a linear value from one unit to another.
     * @param {number | string} value The numerical value to convert.
     * @param {string} fromUnit The starting unit ('inch' or 'metric').
     * @param {string} toUnit The target unit ('inch' or 'metric').
     * @returns {number | null} The converted value, or null if units are invalid or value is not a number.
     */
    function convertLinear(value, fromUnit, toUnit) {
        const numValue = Number(value);
        if (isNaN(numValue) || fromUnit === toUnit) {
            return numValue;
        }
        if (fromUnit === 'inch' && toUnit === 'metric') {
            return numValue * INCH_TO_MM;
        }
        if (fromUnit === 'metric' && toUnit === 'inch') {
            return numValue / INCH_TO_MM;
        }
        return null; // Invalid unit combination
    }

    /**
     * Formats a number to a specified number of decimal places.
     * @param {number | string} value The number to format.
     * @param {number | string} precision The number of decimal places.
     * @returns {string} The formatted number as a string, or the original value if invalid.
     */
    function formatNumber(value, precision) {
        const numValue = Number(value);
        const numPrecision = Number(precision);
        if (isNaN(numValue) || isNaN(numPrecision) || numPrecision < 0) {
            return String(value); // Return original value if not a valid number/precision
        }
        return numValue.toFixed(numPrecision);
    }

    /**
     * Gets the default display precision for a given linear unit.
     * @param {string} unit The linear unit ('inch' or 'metric').
     * @returns {number} The default number of decimal places.
     */
    function getDefaultPrecision(unit) {
        return unit === 'metric' ? 2 : 3;
    }

    // --- UI and Event Handlers ---
    function showStatus(message, isError = false, duration = 2000) {
        if (!dom.status) return;
        dom.status.textContent = message;
        dom.status.classList.remove('hidden');
        dom.status.style.color = isError ? 'var(--danger-color)' : 'green';
        setTimeout(() => { dom.status.classList.add('hidden'); }, duration);
    }

    /**
     * Handles the live conversion of travel values when the linear unit is changed.
     */
    function handleUnitChange() {
        const newUnit = dom.inputUnits.value;
        if (newUnit === previousLinearUnit) {
            return; // No change, do nothing.
        }

        // Determine and set the new default precision.
        const newPrecision = getDefaultPrecision(newUnit);
        dom.precision.value = newPrecision;

        const travelFields = [dom.xTravel, dom.yTravel, dom.zTravel];
        travelFields.forEach(field => {
            const convertedValue = convertLinear(field.value, previousLinearUnit, newUnit);
            if (convertedValue !== null) {
                field.value = formatNumber(convertedValue, newPrecision);
            }
        });

        // After programmatically changing values, we must manually update the visualization.
        if (dom.editBtn.hidden && visualizer) { // Check if in edit mode
            const { geometryData, labelData } = getVisualizationData();
            visualizer.update(geometryData);
            visualizer.addDimensionLabels(labelData.xTravel, labelData.yTravel, labelData.zTravel);
        }

        // Update the state to reflect the new unit for the next potential change.
        previousLinearUnit = newUnit;
    }
    /**
     * Handles the live formatting of travel values when the precision is changed.
     */
    function handlePrecisionChange() {
        const newPrecision = dom.precision.value;
        const travelFields = [dom.xTravel, dom.yTravel, dom.zTravel];
        travelFields.forEach(field => {
            field.value = formatNumber(field.value, newPrecision);
        });
    }

    /**
     * Reads the current values from the form to create a machine data object.
     * Used for live updates of the visualization.
     */
    function getMachineDataFromForm() {
        const data = {};
        allFormInputs.forEach(input => {
            const kebabKey = input.id.replace('machine-', '');
            const camelKey = kebabToCamel(kebabKey);
            let value = input.value;
            if (input.type === 'number') value = Number(value) || 0;
            data[camelKey] = value;
        });
        return data;
    }

    /**
     * Prepares data for the visualizer.
     * Geometry is always in inches for stable sizing.
     * Labels are in the currently selected unit.
     */
    function getVisualizationData() {
        const labelData = getMachineDataFromForm();
        const geometryData = { ...labelData };

        if (labelData.inputUnits === 'metric') {
            geometryData.xTravel = convertLinear(labelData.xTravel, 'metric', 'inch');
            geometryData.yTravel = convertLinear(labelData.yTravel, 'metric', 'inch');
            geometryData.zTravel = convertLinear(labelData.zTravel, 'metric', 'inch');
        }
        
        return { geometryData, labelData };
    }

    function setEditMode(isEditing, machineData = null) {
        allFormInputs.forEach(input => input.disabled = !isEditing);
        dom.editBtn.hidden = isEditing;
        dom.saveBtn.hidden = !isEditing;
        dom.cancelBtn.hidden = !isEditing;
        dom.saveBtn.disabled = !isEditing;
        dom.cancelBtn.disabled = !isEditing;
        // Also disable the main selector and add/delete buttons
        dom.selector.disabled = isEditing;
        dom.addBtn.disabled = isEditing;
        dom.deleteBtn.disabled = isEditing;

        if (isEditing) {
            // When entering edit mode, store the current unit to track changes.
            previousLinearUnit = dom.inputUnits.value;
        }

        if (!isEditing) {
            // When entering view mode, format the travel fields based on the precision setting from the data model.
            // This is more robust than reading the value from the DOM, which might not be populated yet.
            const data = machineData || originalMachineData;
            const precision = data.precision ?? getDefaultPrecision(data.inputUnits);
            const travelFields = [dom.xTravel, dom.yTravel, dom.zTravel];
    
            travelFields.forEach(field => {
                if (field.value) { // Only format if there's a value
                    field.value = formatNumber(field.value, precision);
                }
            });
        }
    }

    function populateSelector() {
        dom.selector.innerHTML = '';
        const machineNames = Object.keys(allMachines);
        if (machineNames.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'No machines configured';
            dom.selector.appendChild(option);
            dom.selector.disabled = true;
            dom.deleteBtn.disabled = true;
            dom.form.classList.add('hidden');
            return;
        }

        dom.selector.disabled = false;
        machineNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            if (name === activeMachineName) {
                option.selected = true;
            }
            dom.selector.appendChild(option);
        });
    }

    function updateFormForMachine(machineName) {
        const machine = allMachines[machineName];
        if (machine) {
            originalMachineData = JSON.parse(JSON.stringify(machine)); // Deep copy for cancellation

            // More robustly populate the form by iterating over the cached form inputs.
            // This is more explicit and safer than iterating over the `dom` object keys.
            allFormInputs.forEach(input => {
                const camelKey = kebabToCamel(input.id.replace('machine-', ''));
                if (machine.hasOwnProperty(camelKey)) {
                    const valueToSet = machine[camelKey];
                    
                    if (input.tagName === 'SELECT') {
                        // For dropdowns, check if the value is a valid option.
                        const optionExists = [...input.options].some(opt => opt.value == valueToSet);
                        if (optionExists) {
                            input.value = valueToSet;
                        } else {
                            // If the saved value is not a valid option, default to the first one to prevent an invalid state.
                            console.warn(`Invalid value "${valueToSet}" for dropdown "${input.id}". Defaulting to first option.`);
                            input.selectedIndex = 0;
                        }
                    } else {
                        // For other inputs (text, number, textarea), just set the value.
                        input.value = valueToSet;
                    }
                } else {
                    // If the data doesn't exist for a field, clear it to prevent stale data.
                    input.value = '';
                }
            });

            // Handle case where precision might not be in the data for older machine configs
            if (machine.precision === undefined) {
                dom.precision.value = getDefaultPrecision(machine.inputUnits);
                originalMachineData.precision = dom.precision.value; // Also update our 'cancel' copy
            }
            dom.form.classList.remove('hidden');
            dom.deleteBtn.disabled = false;
            setEditMode(false, machine);
            if (visualizer) {
                // Use the helper to ensure geometry is always in inches,
                // while labels reflect the current unit. This is critical
                // for when a machine with metric units is first loaded.
                const { geometryData, labelData } = getVisualizationData();
                visualizer.update(geometryData);
                visualizer.addDimensionLabels(labelData.xTravel, labelData.yTravel, labelData.zTravel);
                visualizer.frameScene();
            }
        } else {
            // No machine selected or found, hide the form
            if (dom.form) dom.form.classList.add('hidden');
            dom.deleteBtn.disabled = true;
            if (dom.description) {
                dom.description.value = '';
                dom.description.disabled = true;
            }
        }
    }

    async function loadAllMachineData() {
        try {
            const data = await dataManager.getAllItems();
            allMachines = data.machine || {};
            activeMachineName = data.system?.activeMachineName || null;

            // If active machine doesn't exist, pick the first one
            if (activeMachineName && !allMachines[activeMachineName]) {
                activeMachineName = Object.keys(allMachines)[0] || null;
            }

            populateSelector();
            updateFormForMachine(activeMachineName);
        } catch (error) {
            console.error('Failed to load machine data:', error);
            showStatus('Error loading machine data.', true);
        }
    }

    async function handleSelectionChange() {
        const newActiveName = dom.selector.value;
        if (newActiveName === activeMachineName) return;

        try {
            await dataManager.setItem('system', 'activeMachineName', newActiveName);
            activeMachineName = newActiveName;
            updateFormForMachine(activeMachineName);
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
        } catch (error) {
            console.error('Failed to set active machine:', error);
            showStatus('Error setting active machine.', true);
        }
    }

    async function handleSave() {
        const machineName = activeMachineName;

        if (!machineName) {
            showStatus('No active machine to save.', true);
            return;
        }

        const updatedMachineData = {};
        // A robust way to gather data is to iterate the cached inputs
        // and use their ID to map to a property name.
        allFormInputs.forEach(input => {
            const kebabKey = input.id.replace('machine-', ''); // e.g., 'machine-x-travel'
            const camelKey = kebabToCamel(kebabKey); // -> 'xTravel'
            let value = input.value;
            if (input.type === 'number' && value.trim() !== '' && !isNaN(Number(value))) {
                value = Number(value);
            }
            updatedMachineData[camelKey] = value;
        });

        try {
            // Save the updated data. Renaming is no longer supported via this form.
            await dataManager.setItem('machine', machineName, updatedMachineData);
            
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus('Machine saved successfully.');

            // Reload all data to ensure UI consistency after the save.
            await loadAllMachineData(); // Reload everything to reflect changes

        } catch (error) {
            console.error('Failed to save machine:', error);
            showStatus('Error saving machine.', true);
        }
    }

    function handleCancel() {
        // Revert form to the state it was in before "Edit" was clicked by reloading its data.
        // This is the simplest and most reliable way to cancel changes.
        updateFormForMachine(activeMachineName);
    }

    async function handleDelete() {
        if (!activeMachineName) return;
        if (!confirm(`Are you sure you want to delete the machine "${activeMachineName}"? This cannot be undone.`)) {
            return;
        }

        try {
            await dataManager.deleteItem('machine', activeMachineName);
            
            // Find a new active machine
            const remainingNames = Object.keys(allMachines).filter(name => name !== activeMachineName);
            const newActiveName = remainingNames.length > 0 ? remainingNames[0] : null;
            await dataManager.setItem('system', 'activeMachineName', newActiveName);

            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus(`Machine "${activeMachineName}" deleted.`);
            await loadAllMachineData(); // Reload to update UI

        } catch (error) {
            console.error('Failed to delete machine:', error);
            showStatus('Error deleting machine.', true);
        }
    }

    // --- Modal Functions ---
    function openAddModal() {
        dom.addForm.reset();
        dom.addModal.classList.add('active');
        document.getElementById('new-machine-name').focus();
    }

    function closeAddModal() {
        dom.addModal.classList.remove('active');
    }

    async function handleAddSave(e) {
        e.preventDefault();
        const newName = document.getElementById('new-machine-name').value.trim();
        if (!newName) {
            alert('Machine Name is required.');
            return;
        }
        if (allMachines[newName]) {
            alert(`A machine named "${newName}" already exists.`);
            return;
        }

        // Create a new machine from the default settings
        const defaults = await dataManager.getItem('default-machines', 'Default Mill');
        const newMachine = defaults ? JSON.parse(JSON.stringify(defaults)) : {}; // Deep copy
        newMachine.description = document.getElementById('new-machine-description').value.trim();

        try {
            await dataManager.setItem('machine', newName, newMachine);
            await dataManager.setItem('system', 'activeMachineName', newName);
            globalState.isDirty = true;
            updateGlobalDirtyStatusUI();
            showStatus('New machine added.');
            closeAddModal();
            await loadAllMachineData();
        } catch (error) {
            console.error('Failed to add machine:', error);
            showStatus('Error adding new machine.', true);
        }
    }

    // Attach listeners
    dom.selector.addEventListener('change', handleSelectionChange);
    dom.editBtn.addEventListener('click', () => setEditMode(true));
    dom.cancelBtn.addEventListener('click', handleCancel);
    dom.deleteBtn.addEventListener('click', handleDelete);
    dom.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSave();
    });

    // --- Debugging for form validation ---
    // This listener will fire when the browser finds an invalid field
    // upon a form submission attempt (e.g., clicking the "Save" button).
    // It will log the specific element that is causing the validation to fail.
    dom.form.addEventListener('invalid', (e) => {
        console.error('Form validation failed for:', e.target);
        // You can inspect e.target.id, e.target.value, and e.target.validity
        // in the console to understand why the browser considers it invalid.
    }, true); // Use capture phase to catch the event as it propagates down.

    dom.inputUnits.addEventListener('change', handleUnitChange);
    dom.precision.addEventListener('change', handlePrecisionChange);
    // Add listeners for live visualization updates
    allFormInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (dom.editBtn.hidden && visualizer) { // In edit mode
                const { geometryData, labelData } = getVisualizationData();
                visualizer.update(geometryData);
                visualizer.addDimensionLabels(labelData.xTravel, labelData.yTravel, labelData.zTravel);
            }
        });
    });

    // Modal Listeners
    dom.addBtn.addEventListener('click', openAddModal);
    dom.modalCloseBtn.addEventListener('click', closeAddModal);
    dom.modalCancelBtn.addEventListener('click', closeAddModal);
    dom.addForm.addEventListener('submit', handleAddSave);

    // Initial load
    if (dom.canvas) {
        visualizer = new MachineVisualizer(dom.canvas);
        visualizer.init();
    }
    loadAllMachineData();
    console.log(`[setupMachineView] END.`);

    return () => {
        if (visualizer) {
            visualizer.dispose();
        }
        // Teardown guard
        if (dom.editBtn.hidden) { // We are in edit mode
            return confirm('You have unsaved changes. Are you sure you want to leave?');
        }
        return true; // OK to navigate away
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
        if (dom.importFileInput) {
            dom.importFileInput.addEventListener('change', async (event) => {
                try {
                    await handleGlobalImport(event);
                    currentView = null; // Force reload
                    await loadView('program', () => {
                        // The program view uses a simple alert for this confirmation
                        alert('Data imported successfully.');
                    });
                } catch (error) {
                    console.error('Failed to import data from Program view:', error); // Keep console log
                    alert(`Error importing data: ${error.message}`);
                }
            });
        }
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
            // Do not overwrite the user's session. The app will proceed with the data from localStorage.
            return;
        }

        // If we are here, local storage is empty. Let's fetch the initial data file.
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

    } catch (error) {
        console.error('Could not load initial data from datastore.json:', error);
        alert('Warning: Could not load initial data from the server. The application will start with an empty data store.');
    }
}

// --- App Initialization ---
async function initializeApp() {
    console.log(`%c[initializeApp] START. currentView is: '${currentView}'.`, 'color: purple; font-weight: bold;');
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

    // Load the last active view from sessionStorage, or the default view.
    // This makes the app resilient to unexpected page reloads.
    const lastView = sessionStorage.getItem('lastActiveView');
    const viewToLoad = lastView || 'bolt-hole-circle';
    console.log(`[initializeApp] Restoring view. Found '${lastView || 'nothing'}' in sessionStorage. Loading '${viewToLoad}'.`);
    loadView(viewToLoad);
    console.log(`%c[initializeApp] END. currentView is: '${currentView}'.`, 'color: purple; font-weight: bold;');
}

initializeApp();
