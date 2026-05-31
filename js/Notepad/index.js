(function () {
    const STORAGE_KEY = 'shell:notepad:draft';

    function initNotepadApp(shellWindow) {
        const root = shellWindow?.body || document;
        const editor = root.querySelector('#notepad-editor');
        const status = root.querySelector('#notepad-status');
        if (!editor || !status) return;

        const cached = localStorage.getItem(STORAGE_KEY);
        if (typeof cached === 'string') {
            editor.value = cached;
        }

        let saveTimer = null;
        editor.addEventListener('input', () => {
            status.textContent = 'Editing...';
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                localStorage.setItem(STORAGE_KEY, editor.value);
                status.textContent = 'Saved';
            }, 250);
        });

        editor.focus();
    }

    window.initNotepadApp = initNotepadApp;
})();
