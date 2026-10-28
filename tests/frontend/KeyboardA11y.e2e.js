import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function moduleSource(relativePath, exposeExpression) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    return `${source}\nwindow.__testModule = ${exposeExpression};\n`;
}

test.describe('Keyboard and accessibility observers with large option lists', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('about:blank');
        await page.addScriptTag({
            type: 'module',
            content: moduleSource('public/scripts/keyboard.js', '{ initKeyboard, isKeyboardInteractable, registerInteractableType }'),
        });
        await page.addScriptTag({
            type: 'module',
            content: moduleSource('public/scripts/a11y.js', '{ initAccessibility }'),
        });
        await page.waitForFunction(() => Boolean(window.__testModule));
        // The second module overwrites the first module's handle. Keep both handles.
        await page.evaluate(() => {
            const a11y = window.__testModule;
            window.__a11y = a11y;
        });
    });

    test('keeps dynamic interactables and a11y roles while adding many options', async ({ page }) => {
        // Re-import keyboard after a11y so both handles are available.
        await page.addScriptTag({
            type: 'module',
            content: moduleSource('public/scripts/keyboard.js', '{ initKeyboard, isKeyboardInteractable, registerInteractableType }'),
        });
        await page.waitForFunction(() => Boolean(window.__testModule));

        const result = await page.evaluate(async () => {
            const keyboard = window.__testModule;
            const a11y = window.__a11y;
            keyboard.initKeyboard();
            a11y.initAccessibility();

            const select = document.createElement('select');
            select.id = 'model_custom_select';
            const start = performance.now();
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < 10000; i++) {
                const option = document.createElement('option');
                option.textContent = `model-${i}`;
                fragment.appendChild(option);
            }
            select.appendChild(fragment);
            document.body.appendChild(select);

            const button = document.createElement('div');
            button.className = 'menu_button';
            button.textContent = 'dynamic button';
            document.body.appendChild(button);

            const toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.innerHTML = '<div class="toast">hello</div>';
            document.body.appendChild(toastContainer);

            await new Promise(resolve => setTimeout(resolve, 150));
            const elapsed = performance.now() - start;

            // A custom interactable registered after the bulk insert must still work.
            keyboard.registerInteractableType('.custom-test-interactable');
            const custom = document.createElement('div');
            custom.className = 'custom-test-interactable';
            custom.textContent = 'custom';
            document.body.appendChild(custom);
            await new Promise(resolve => setTimeout(resolve, 100));

            return {
                elapsed,
                buttonIsInteractable: button.classList.contains('interactable'),
                buttonTabIndex: button.getAttribute('tabindex'),
                customIsInteractable: custom.classList.contains('interactable'),
                customIsKeyboardInteractable: keyboard.isKeyboardInteractable(custom),
                toastRole: toastContainer.querySelector('.toast')?.getAttribute('role'),
                optionRole: select.querySelector('option')?.getAttribute('role'),
            };
        });

        expect(result.buttonIsInteractable).toBe(true);
        expect(result.buttonTabIndex).toBe('0');
        expect(result.customIsKeyboardInteractable).toBe(true);
        expect(result.customIsInteractable).toBe(true);
        expect(result.toastRole).toBe('status');
        expect(result.optionRole).toBeNull();
        // Without the option short-circuit this observer walk takes far longer.
        expect(result.elapsed).toBeLessThan(3000);
    });
});
