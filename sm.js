/**
 * A module for dynamically managing CSS rules on the page.
 * It creates and manages a <style> tag in the document's head
 * to apply or update CSS rules on the fly.
 */
class StyleManager {
    constructor() {
        // Find or create a dedicated <style> tag for dynamic rules.
        let styleEl = document.querySelector('#dynamic-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dynamic-styles';
            document.head.appendChild(styleEl);
        }
        this.sheet = styleEl.sheet;
    }

    /**
     * Sets or updates a CSS style for a given selector.
     * @param {string} selector - The CSS selector (e.g., 'body', '.btn-primary').
     * @param {string} property - The CSS property (e.g., 'background-color').
     * @param {string} value - The value for the CSS property.
     */
    setRule(selector, property, value) {
        if (!selector || !property) {
            console.error('Selector and property are required to set a rule.');
            return;
        }

        // Find if a rule for this selector already exists to update it.
        for (let i = 0; i < this.sheet.cssRules.length; i++) {
            if (this.sheet.cssRules[i].selectorText === selector) {
                this.sheet.cssRules[i].style.setProperty(property, value);
                return;
            }
        }

        // If no rule exists, insert a new one.
        this.sheet.insertRule(`${selector} { ${property}: ${value}; }`, this.sheet.cssRules.length);
    }

    /**
     * Gets all rules from a specific stylesheet loaded on the page.
     * @param {string} sheetHref - The href (or a part of it) of the stylesheet to parse.
     * @returns {Array<object>} An array of rule objects, each with a selector and its declarations.
     */
    getAllRules(sheetHref) {
        const allRules = [];
        const styleSheet = Array.from(document.styleSheets).find(
            sheet => sheet.href && sheet.href.endsWith(sheetHref)
        );

        if (!styleSheet) {
            console.warn(`Stylesheet with href ending in '${sheetHref}' not found.`);
            return [];
        }

        try {
            // Iterate through the rules of the found stylesheet
            for (const rule of styleSheet.cssRules) {
                if (rule instanceof CSSStyleRule) {
                    const declarations = [];
                    // Iterate through the style declarations of the rule
                    for (let i = 0; i < rule.style.length; i++) {
                        const property = rule.style[i];
                        const value = rule.style.getPropertyValue(property);
                        declarations.push({ property, value });
                    }
                    if (declarations.length > 0) {
                        allRules.push({ selectorText: rule.selectorText, declarations });
                    }
                }
            }
        } catch (e) {
            console.error("Could not read CSS rules. This may be due to a cross-origin restriction.", e);
        }
        return allRules;
    }

    /**
     * Renders the entire style editor UI into a given container element.
     * @param {HTMLElement} container - The element to render the UI into.
     */
    renderUI(container) {
        if (!container) {
            console.error("A container element must be provided to render the UI.");
            return;
        }

        const rules = this.getAllRules('styles.css');

        // --- 1. Create UI Elements ---
        const dropdownGroup = document.createElement('div');
        dropdownGroup.className = 'form-group';

        const dropdownLabel = document.createElement('label');
        dropdownLabel.htmlFor = 'style-selector-dropdown';
        dropdownLabel.textContent = 'CSS Rule:';

        const dropdown = document.createElement('select');
        dropdown.id = 'style-selector-dropdown';
        dropdown.innerHTML = '<option value="">-- Select a Rule --</option>';

        dropdownGroup.append(dropdownLabel, dropdown);

        const editorContainer = document.createElement('div');
        // This class is now applied dynamically, not on the container
        // editorContainer.className = 'style-rule-editor'; 

        container.append(dropdownGroup, editorContainer);

        // --- 2. Define Rendering Logic ---
        const cssVariables = {};
        const rootRule = rules.find(r => r.selectorText === ':root');
        if (rootRule) {
            rootRule.declarations.forEach(decl => {
                cssVariables[decl.property] = decl.value.trim();
            });
        }

        const populateDropdown = () => {
            if (rules.length === 0) {
                dropdown.disabled = true;
                dropdown.innerHTML = '<option>No styles found</option>';
                return;
            }
            rules.forEach((rule, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = rule.selectorText;
                dropdown.appendChild(option);
            });
        };

        const renderEditor = (ruleIndex) => {
            editorContainer.innerHTML = '';
            if (ruleIndex === '' || ruleIndex === null) return;

            const rule = rules[ruleIndex];
            if (!rule) return;

            const ruleWrapper = document.createElement('div');
            ruleWrapper.className = 'style-rule-editor';

            const controlsContainer = document.createElement('div');
            const previewBox = document.createElement('h3');
            previewBox.className = 'editor-preview';
            previewBox.textContent = 'Example';

            const selectorTitle = document.createElement('h3');
            selectorTitle.className = 'selector-title';
            selectorTitle.textContent = rule.selectorText;
            controlsContainer.appendChild(selectorTitle);

            rule.declarations.forEach(decl => {
                const declContainer = document.createElement('div');
                declContainer.className = 'style-declaration';

                const propInput = document.createElement('input');
                propInput.type = 'text';
                propInput.value = decl.property;
                propInput.readOnly = true;

                const valueWrapper = document.createElement('div');
                valueWrapper.className = 'value-wrapper';

                const valueInput = document.createElement('input');
                valueInput.type = 'text';
                valueInput.value = decl.value;
                valueWrapper.appendChild(valueInput);

                const isColorProperty = /(^color$|color$|^background$|^border(-top|-right|-bottom|-left)?$)/i.test(decl.property);
                if (isColorProperty) {
                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';

                    let resolvedValue = decl.value.trim();
                    if (resolvedValue.startsWith('var(')) {
                        const varName = resolvedValue.substring(4, resolvedValue.length - 1);
                        if (cssVariables[varName]) {
                            resolvedValue = cssVariables[varName];
                        }
                    }
                    colorInput.value = resolvedValue;

                    colorInput.addEventListener('input', () => {
                        valueInput.value = colorInput.value;
                    });

                    valueInput.addEventListener('input', () => {
                        let textValue = valueInput.value.trim();
                        if (textValue.startsWith('var(')) {
                            const varName = textValue.substring(4, textValue.length - 1);
                            if (cssVariables[varName]) {
                                textValue = cssVariables[varName];
                            }
                        }
                        colorInput.value = textValue;
                    });

                    valueWrapper.prepend(colorInput);
                }

                const updateBtn = document.createElement('button');
                updateBtn.textContent = 'Update';
                updateBtn.onclick = () => {
                    const newValue = valueInput.value.trim();
                    this.setRule(rule.selectorText, decl.property, newValue);
                    previewBox.style.setProperty(decl.property, newValue);
                };

                declContainer.append(propInput, valueWrapper, updateBtn);
                controlsContainer.appendChild(declContainer);
                previewBox.style.setProperty(decl.property, decl.value);
            });

            ruleWrapper.append(controlsContainer, previewBox);
            editorContainer.appendChild(ruleWrapper);
        };

        // --- 3. Initialize UI ---
        dropdown.addEventListener('change', (event) => renderEditor(event.target.value));
        populateDropdown();
    }
}

export const styleManager = new StyleManager();
