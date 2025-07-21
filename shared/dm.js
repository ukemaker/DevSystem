/**
 * A structured data store that uses localStorage for persistence.
 * Data is organized by Module and Key, and can be imported/exported as JSON.
 */
const STORAGE_KEY = 'testAppData';

/**
 * Retrieves the data store from localStorage.
 * The store is expected to be an object.
 * @returns {object} The parsed data store or an empty object.
 */
const getStore = () => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        // Ensure we return an object, even if localStorage is empty or invalid
        const parsed = data ? JSON.parse(data) : {};
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
        console.error("Failed to parse data from localStorage.", e);
        return {};
    }
};

/**
 * Saves the data store to localStorage.
 * @param {object} data The data store to save.
 */
const saveStore = (data) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error("Failed to save data to localStorage.", error);
        // Re-throw the error so the calling application can handle it.
        throw new Error("Could not save data. Storage might be full.");
    }
};

export const dataManager = {
    /**
     * Sets a key-value pair within a specific module.
     * @param {string} module The name of the module.
     * @param {string} key The key for the item.
     * @param {any} value The value to store.
     * @returns {Promise<void>}
     */
    setItem: async (module, key, value) => {
        if (!module || !key) {
            throw new Error("Module and Key are required.");
        }
        const store = getStore();
        if (!store[module]) {
            store[module] = {};
        }
        store[module][key] = value;
        saveStore(store);
    },

    /**
     * Deletes a specific key from a module.
     * @param {string} module The name of the module.
     * @param {string} key The key of the item to delete.
     * @returns {Promise<void>}
     */
    deleteItem: async (module, key) => {
        if (!module || !key) {
            throw new Error("Module and Key are required to delete an item.");
        }
        const store = getStore();
        if (store[module] && store[module][key] !== undefined) {
            delete store[module][key];
            // If the module is now empty, remove the module itself
            if (Object.keys(store[module]).length === 0) {
                delete store[module];
            }
            saveStore(store);
        }
    },

    /**
     * Retrieves all items from the data store.
     * @returns {Promise<object>} A promise that resolves with the entire data store object.
     */
    getAllItems: async () => getStore(),

    /**
     * Retrieves a single item from the data store.
     * @param {string} module The name of the module.
     * @param {string} key The key of the item to retrieve.
     * @returns {Promise<any|undefined>} A promise that resolves with the item's value, or undefined if not found.
     */
    getItem: async (module, key) => {
        if (!module || !key) {
            throw new Error("Module and Key are required to get an item.");
        }
        const store = getStore();
        // Use optional chaining for a concise and safe property access.
        return store[module]?.[key];
    },

    /**
     * Clears all items from the data store.
     * @returns {Promise<void>}
     */
    clearAllItems: async () => saveStore({}),

    /**
     * Prepares the entire data store for export as a JSON file.
     * This function is UI-agnostic and returns the data as a Blob.
     * @returns {Promise<{blob: Blob, filename: string}>} A promise that resolves with the blob and a suggested filename.
     */
    getExportableJson: async () => {
        const store = getStore();

        // Separate schema from the rest of the data to control export order.
        const { _schema, ...data } = store;

        // Define or ensure the default schema exists.
        const finalSchema = _schema || {};
        if (!finalSchema.labels) {
            finalSchema.labels = {
                module: "Module",
                key: "Key",
                value: "Item"
            };
        }

        // Reconstruct the object for export with the schema first for readability.
        const dataToExport = {
            _schema: finalSchema,
            ...data
        };

        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        return {
            blob,
            filename: 'datastore.json'
        };
    },

    /**
     * Loads data from a user-selected JSON file, overriding the current store.
     * @param {File} file The JSON file to load.
     * @returns {Promise<void>} A promise that resolves when the data is loaded and saved.
     */
    loadDataFromJson: (file) => {
        return new Promise((resolve, reject) => {
            if (!file) {
                return reject(new Error("No file provided."));
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const content = event.target.result;
                    const jsonData = JSON.parse(content);

                    if (typeof jsonData !== 'object' || jsonData === null || Array.isArray(jsonData)) {
                        throw new Error("Invalid JSON format. The root must be an object.");
                    }
                    
                    saveStore(jsonData);
                    resolve();
                } catch (error) {
                    console.error("Failed to load or parse JSON file.", error);
                    reject(error);
                }
            };
            reader.onerror = (error) => {
                console.error("File reading error.", error);
                reject(error);
            };
            reader.readAsText(file);
        });
    },
};
