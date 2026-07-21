// Tauri版のローカルデータストア。Web版のHTTP API互換層として動作し、
        // Node.jsサーバーなしで保存・検索・インポート・エクスポートを行う。
        const localStore = MineparserLocalStore.createLocalStore();
        // 起動後のAPI呼び出しごとのJSON.parseを避ける。永続化は変更時だけ行う。
        let localNodesCache;
        const readLocalNodes = () => (localNodesCache ??= localStore.read());
        const writeLocalNodes = (nodes) => {
            localNodesCache = nodes;
            localStore.write(nodes);
        };
        const localNode = localStore.node;
        const localChildren = localStore.children;
        const localTree = localStore.tree;
        const localSearch = localStore.search;
        const localResponse = (body, status = 200) => ({ ok: status >= 200 && status < 300, status,
            statusText: status === 404 ? 'Not Found' : 'OK', json: async () => body });
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (url, options = {}) => {
            if (!String(url).includes('/api/')) return nativeFetch(url, options);
            const u = new URL(url, window.location.href), path = u.pathname.replace(/^.*\/api/, '') || '/';
            const method = (options.method || 'GET').toUpperCase();
            const nodes = readLocalNodes();
            const body = options.body ? JSON.parse(options.body) : null;
            if (path === '/tree' && method === 'GET') return localResponse(localTree(nodes));
            if (path === '/export' && method === 'GET') return localResponse({ schema_version: 1, exported_at: new Date().toISOString(), nodes: Object.entries(nodes).map(([id, n]) => ({ id, parent_id: id ? id.slice(0, -1) : null, nav_label: n.navLabel || '', content: n.content || '', content_length: (n.content || '').length })) });
            if (path === '/import' && method === 'POST') {
                const imported = {}; (body.nodes || []).forEach(n => { imported[n.id || ''] = { navLabel: n.navLabel ?? n.nav_label ?? '', content: n.content || '' }; });
                writeLocalNodes(imported); return localResponse({ success: true });
            }
            if (path === '/search' || path === '/search/autocomplete') {
                const q = (u.searchParams.get('q') || '').toLowerCase();
                return localResponse(localSearch(nodes, q, path.includes('autocomplete') ? 10 : 100));
            }
            if (path === '/nodes/children' && method === 'GET') return localResponse(localChildren(nodes, ''));
            if (path === '/nodes' && method === 'GET') return nodes[''] ? localResponse(localNode('', nodes[''])) : localResponse({ error: 'Node not found' }, 404);
            if (path === '/nodes' && method === 'POST') { nodes[''] = { navLabel: body.navLabel || '', content: body.content || '' }; writeLocalNodes(nodes); return localResponse({ success: true }); }
            const nodeMatch = path.match(/^\/nodes\/([^/]+)$/);
            const childMatch = path.match(/^\/nodes\/([^/]+)\/children$/);
            if (childMatch && method === 'GET') return localResponse(localChildren(nodes, decodeURIComponent(childMatch[1])));
            if (nodeMatch) {
                const id = decodeURIComponent(nodeMatch[1]);
                if (method === 'GET') return nodes[id] ? localResponse({ ...localNode(id, nodes[id]), children: Object.fromEntries(localChildren(nodes, id).map(n => [n.id.slice(-1), n.id])) }) : localResponse({ error: 'Node not found' }, 404);
                if (method === 'POST') { nodes[id] = { navLabel: body.navLabel || '', content: body.content || '' }; writeLocalNodes(nodes); return localResponse({ success: true }); }
                if (method === 'DELETE') { Object.keys(nodes).filter(k => k === id || k.startsWith(id)).forEach(k => delete nodes[k]); writeLocalNodes(nodes); return localResponse({ success: true }); }
            }
            return localResponse({ error: 'Not found' }, 404);
        };
        const API_BASE = '/api';
        let currentPath = ''; // 現在の階層パス（空文字列 = 最上位）
        let hierarchyTree = {}; // 階層ツリー（キャッシュ）
        let autocompleteTimeout = null;
        let searchSyncTimeout = null; // 検索バー→階層UI同期用デバウンス
        let lastNavigateToPathAt = 0; // 階層移動直後の input で上書きしないガード用
        let inputMode = localStorage.getItem('mineparser.inputMode') || 'qwerty'; // レイアウトID
        let pasteMode = localStorage.getItem('mineparser.pasteMode') || 'copy';
        let interfaceLanguage = localStorage.getItem('mineparser.interfaceLanguage') || 'en';

        const UI_TRANSLATIONS = {
            en: {
                settings: 'Settings', language: 'Interface language', languageHelp: 'Choose a preferred interface language.', close: 'Close',
                mode: 'Mode', copyOnly: 'Copy only', copyOnlyHelp: 'Copy saved text to the clipboard.', pastePrevious: 'Paste to previous app', pastePreviousHelp: 'Return to the previous app and paste automatically.',
                help: 'Keyboard shortcuts', edit: 'Edit item', cancel: 'Cancel', save: 'Save', navLabel: 'Navigation label', savedText: 'Saved text', collapse: 'Collapse', suggestions: 'Suggestions',
                navLabelHelp: 'A short label shown on the keyboard and used for search.', savedTextHelp: 'The prompt, command, or reusable text returned by this item.',
                search: 'Type to search or navigate...', tryTyping: 'Try typing a keyword, or press a mapped key to navigate.'
            },
            ja: {
                settings: '設定', language: '表示言語', languageHelp: '使用する表示言語を選択してください。', close: '閉じる',
                mode: 'モード', copyOnly: 'コピーのみ', copyOnlyHelp: '保存した文字列をクリップボードへコピーします。', pastePrevious: '元のアプリへ貼り付け', pastePreviousHelp: '呼び出し前のアプリへ戻り、自動で貼り付けます。',
                help: 'キーボードショートカット', edit: '項目を編集', cancel: 'キャンセル', save: '保存', navLabel: 'ナビゲーションラベル', savedText: '保存する文字列', collapse: '折りたたむ', suggestions: '候補',
                navLabelHelp: 'キーボードに表示し、検索に使う短いラベルです。', savedTextHelp: '選択したときに返すプロンプト、コマンド、定型文です。',
                search: '検索または移動...', tryTyping: 'キーワードを入力するか、割り当てキーで移動してください。'
            },
            'zh-CN': { settings: '设置', language: '界面语言', languageHelp: '选择界面语言。', close: '关闭', mode: '模式', copyOnly: '仅复制', copyOnlyHelp: '将保存的文本复制到剪贴板。', pastePrevious: '粘贴到上一个应用', pastePreviousHelp: '返回上一个应用并自动粘贴。', help: '键盘快捷键', edit: '编辑项目', cancel: '取消', save: '保存', navLabel: '导航标签', savedText: '保存的文本', navLabelHelp: '显示在键盘上并用于搜索的短标签。', savedTextHelp: '此项目返回的提示词、命令或可复用文本。', search: '搜索或导航...', tryTyping: '输入关键词，或按映射键导航。' },
            'zh-TW': { settings: '設定', language: '介面語言', languageHelp: '選擇介面語言。', close: '關閉', mode: '模式', copyOnly: '僅複製', copyOnlyHelp: '將儲存的文字複製到剪貼簿。', pastePrevious: '貼到上一個應用程式', pastePreviousHelp: '返回上一個應用程式並自動貼上。', help: '鍵盤快速鍵', edit: '編輯項目', cancel: '取消', save: '儲存', navLabel: '導覽標籤', savedText: '儲存的文字', navLabelHelp: '顯示在鍵盤上並用於搜尋的短標籤。', savedTextHelp: '此項目返回的提示、指令或可重複使用的文字。', search: '搜尋或導覽...', tryTyping: '輸入關鍵字，或按映射鍵導覽。' },
            ko: { settings: '설정', language: '인터페이스 언어', languageHelp: '인터페이스 언어를 선택하세요.', close: '닫기', mode: '모드', copyOnly: '복사만', copyOnlyHelp: '저장된 텍스트를 클립보드에 복사합니다.', pastePrevious: '이전 앱에 붙여넣기', pastePreviousHelp: '이전 앱으로 돌아가 자동으로 붙여넣습니다.', help: '키보드 단축키', edit: '항목 편집', cancel: '취소', save: '저장', navLabel: '탐색 라벨', savedText: '저장된 텍스트', navLabelHelp: '키보드에 표시되고 검색에 사용되는 짧은 라벨입니다.', savedTextHelp: '이 항목이 반환하는 프롬프트, 명령 또는 재사용 텍스트입니다.', search: '검색 또는 탐색...', tryTyping: '키워드를 입력하거나 매핑된 키로 탐색하세요.' },
            es: { settings: 'Ajustes', language: 'Idioma de interfaz', languageHelp: 'Elige el idioma de la interfaz.', close: 'Cerrar', mode: 'Modo', copyOnly: 'Solo copiar', copyOnlyHelp: 'Copia el texto guardado al portapapeles.', pastePrevious: 'Pegar en la aplicación anterior', pastePreviousHelp: 'Vuelve a la aplicación anterior y pega automáticamente.', help: 'Atajos de teclado', edit: 'Editar elemento', cancel: 'Cancelar', save: 'Guardar', navLabel: 'Etiqueta de navegación', savedText: 'Texto guardado', navLabelHelp: 'Etiqueta corta que se muestra en el teclado y se usa para buscar.', savedTextHelp: 'Prompt, comando o texto reutilizable que devuelve este elemento.', search: 'Buscar o navegar...', tryTyping: 'Escribe una palabra clave o usa una tecla asignada.' },
            fr: { settings: 'Paramètres', language: 'Langue de l’interface', languageHelp: 'Choisissez la langue de l’interface.', close: 'Fermer', mode: 'Mode', copyOnly: 'Copier seulement', copyOnlyHelp: 'Copie le texte enregistré dans le presse-papiers.', pastePrevious: 'Coller dans l’application précédente', pastePreviousHelp: 'Retourne à l’application précédente et colle automatiquement.', help: 'Raccourcis clavier', edit: 'Modifier l’élément', cancel: 'Annuler', save: 'Enregistrer', navLabel: 'Libellé de navigation', savedText: 'Texte enregistré', navLabelHelp: 'Libellé court affiché sur le clavier et utilisé pour la recherche.', savedTextHelp: 'Prompt, commande ou texte réutilisable renvoyé par cet élément.', search: 'Rechercher ou naviguer...', tryTyping: 'Saisissez un mot-clé ou utilisez une touche attribuée.' },
            de: { settings: 'Einstellungen', language: 'Oberflächensprache', languageHelp: 'Wählen Sie die Sprache der Oberfläche.', close: 'Schließen', mode: 'Modus', copyOnly: 'Nur kopieren', copyOnlyHelp: 'Gespeicherten Text in die Zwischenablage kopieren.', pastePrevious: 'In vorherige App einfügen', pastePreviousHelp: 'Zur vorherigen App zurückkehren und automatisch einfügen.', help: 'Tastenkürzel', edit: 'Element bearbeiten', cancel: 'Abbrechen', save: 'Speichern', navLabel: 'Navigationslabel', savedText: 'Gespeicherter Text', navLabelHelp: 'Kurzes Label für Tastatur und Suche.', savedTextHelp: 'Prompt, Befehl oder wiederverwendbarer Text dieses Elements.', search: 'Suchen oder navigieren...', tryTyping: 'Geben Sie ein Stichwort ein oder nutzen Sie eine zugewiesene Taste.' },
            pt: { settings: 'Configurações', language: 'Idioma da interface', languageHelp: 'Escolha o idioma da interface.', close: 'Fechar', mode: 'Modo', copyOnly: 'Somente copiar', copyOnlyHelp: 'Copiar o texto salvo para a área de transferência.', pastePrevious: 'Colar no app anterior', pastePreviousHelp: 'Voltar ao app anterior e colar automaticamente.', help: 'Atalhos de teclado', edit: 'Editar item', cancel: 'Cancelar', save: 'Salvar', navLabel: 'Rótulo de navegação', savedText: 'Texto salvo', navLabelHelp: 'Rótulo curto exibido no teclado e usado na busca.', savedTextHelp: 'Prompt, comando ou texto reutilizável retornado por este item.', search: 'Pesquisar ou navegar...', tryTyping: 'Digite uma palavra-chave ou use uma tecla mapeada.' },
            it: { settings: 'Impostazioni', language: 'Lingua dell’interfaccia', languageHelp: 'Scegli la lingua dell’interfaccia.', close: 'Chiudi', mode: 'Modalità', copyOnly: 'Solo copia', copyOnlyHelp: 'Copia il testo salvato negli appunti.', pastePrevious: 'Incolla nell’app precedente', pastePreviousHelp: 'Torna all’app precedente e incolla automaticamente.', help: 'Scorciatoie da tastiera', edit: 'Modifica elemento', cancel: 'Annulla', save: 'Salva', navLabel: 'Etichetta di navigazione', savedText: 'Testo salvato', navLabelHelp: 'Etichetta breve mostrata sulla tastiera e usata per la ricerca.', savedTextHelp: 'Prompt, comando o testo riutilizzabile restituito da questo elemento.', search: 'Cerca o naviga...', tryTyping: 'Digita una parola chiave o usa un tasto mappato.' },
            ru: { settings: 'Настройки', language: 'Язык интерфейса', languageHelp: 'Выберите язык интерфейса.', close: 'Закрыть', mode: 'Режим', copyOnly: 'Только копировать', copyOnlyHelp: 'Скопировать сохранённый текст в буфер обмена.', pastePrevious: 'Вставить в предыдущее приложение', pastePreviousHelp: 'Вернуться в предыдущее приложение и вставить автоматически.', help: 'Сочетания клавиш', edit: 'Изменить элемент', cancel: 'Отмена', save: 'Сохранить', navLabel: 'Метка навигации', savedText: 'Сохранённый текст', navLabelHelp: 'Короткая метка для клавиатуры и поиска.', savedTextHelp: 'Промпт, команда или повторно используемый текст этого элемента.', search: 'Поиск или навигация...', tryTyping: 'Введите ключевое слово или используйте назначенную клавишу.' },
            hi: { settings: 'सेटिंग्स', language: 'इंटरफ़ेस भाषा', languageHelp: 'इंटरफ़ेस भाषा चुनें।', close: 'बंद करें', mode: 'मोड', copyOnly: 'केवल कॉपी करें', copyOnlyHelp: 'सहेजे गए टेक्स्ट को क्लिपबोर्ड पर कॉपी करें।', pastePrevious: 'पिछले ऐप में पेस्ट करें', pastePreviousHelp: 'पिछले ऐप पर लौटकर अपने आप पेस्ट करें।', help: 'कीबोर्ड शॉर्टकट', edit: 'आइटम संपादित करें', cancel: 'रद्द करें', save: 'सहेजें', navLabel: 'नेविगेशन लेबल', savedText: 'सहेजा गया टेक्स्ट', navLabelHelp: 'कीबोर्ड पर दिखने वाला छोटा लेबल।', savedTextHelp: 'इस आइटम द्वारा लौटाया गया प्रॉम्प्ट, कमांड या टेक्स्ट।', search: 'खोजें या नेविगेट करें...', tryTyping: 'कीवर्ड लिखें या मैप की गई कुंजी दबाएँ।' },
            ar: { settings: 'الإعدادات', language: 'لغة الواجهة', languageHelp: 'اختر لغة الواجهة.', close: 'إغلاق', mode: 'الوضع', copyOnly: 'نسخ فقط', copyOnlyHelp: 'نسخ النص المحفوظ إلى الحافظة.', pastePrevious: 'لصق في التطبيق السابق', pastePreviousHelp: 'العودة إلى التطبيق السابق واللصق تلقائياً.', help: 'اختصارات لوحة المفاتيح', edit: 'تحرير العنصر', cancel: 'إلغاء', save: 'حفظ', navLabel: 'تسمية التنقل', savedText: 'النص المحفوظ', navLabelHelp: 'تسمية قصيرة تظهر على لوحة المفاتيح وتستخدم للبحث.', savedTextHelp: 'الموجه أو الأمر أو النص القابل لإعادة الاستخدام لهذا العنصر.', search: 'بحث أو تنقل...', tryTyping: 'اكتب كلمة مفتاحية أو استخدم مفتاحاً مخصصاً.' }
        };

        function currentUiText() { return UI_TRANSLATIONS[interfaceLanguage] || UI_TRANSLATIONS.en; }
        const UI_LABELS = {
            en: ['Help', 'Export', 'Import', 'Keyboard', 'Settings', 'Mode'],
            ja: ['ヘルプ', 'エクスポート', 'インポート', 'キーボード', '設定', 'モード'],
            'zh-CN': ['帮助', '导出', '导入', '键盘', '设置', '模式'], 'zh-TW': ['說明', '匯出', '匯入', '鍵盤', '設定', '模式'],
            ko: ['도움말', '내보내기', '가져오기', '키보드', '설정', '모드'], es: ['Ayuda', 'Exportar', 'Importar', 'Teclado', 'Ajustes', 'Modo'],
            fr: ['Aide', 'Exporter', 'Importer', 'Clavier', 'Paramètres', 'Mode'], de: ['Hilfe', 'Export', 'Import', 'Tastatur', 'Einstellungen', 'Modus'],
            pt: ['Ajuda', 'Exportar', 'Importar', 'Teclado', 'Configurações', 'Modo'], it: ['Aiuto', 'Esporta', 'Importa', 'Tastiera', 'Impostazioni', 'Modalità'],
            ru: ['Справка', 'Экспорт', 'Импорт', 'Клавиатура', 'Настройки', 'Режим'], hi: ['मदद', 'निर्यात', 'आयात', 'कीबोर्ड', 'सेटिंग्स', 'मोड'],
            ar: ['مساعدة', 'تصدير', 'استيراد', 'لوحة المفاتيح', 'الإعدادات', 'الوضع']
        };
        const SHORTCUT_LABELS = {
            en: ['Web demo shortcuts', 'Search', 'Open', 'Copy', 'Go up', 'Collapse'], ja: ['Webデモのショートカット', '検索', '開く', 'コピー', '上へ戻る', '折りたたむ'],
            'zh-CN': ['Web 演示快捷键', '搜索', '打开', '复制', '返回上级', '收起'], 'zh-TW': ['Web 示範快速鍵', '搜尋', '開啟', '複製', '返回上層', '收合'],
            ko: ['웹 데모 단축키', '검색', '열기', '복사', '위로 이동', '접기'], es: ['Atajos de la demo web', 'Buscar', 'Abrir', 'Copiar', 'Subir', 'Contraer'],
            fr: ['Raccourcis de la démo web', 'Rechercher', 'Ouvrir', 'Copier', 'Remonter', 'Réduire'], de: ['Web-Demo-Tastenkürzel', 'Suchen', 'Öffnen', 'Kopieren', 'Nach oben', 'Einklappen'],
            pt: ['Atalhos da demonstração web', 'Pesquisar', 'Abrir', 'Copiar', 'Subir', 'Recolher'], it: ['Scorciatoie della demo web', 'Cerca', 'Apri', 'Copia', 'Su', 'Comprimi'],
            ru: ['Быстрые клавиши веб-демо', 'Поиск', 'Открыть', 'Копировать', 'Вверх', 'Свернуть'], hi: ['वेब डेमो शॉर्टकट', 'खोजें', 'खोलें', 'कॉपी करें', 'ऊपर जाएँ', 'समेटें'],
            ar: ['اختصارات العرض التجريبي', 'بحث', 'فتح', 'نسخ', 'للأعلى', 'طي']
        };

        function applyUiLanguage() {
            const t = currentUiText();
            const japanese = interfaceLanguage === 'ja';
            const setText = (selector, value) => document.querySelectorAll(selector).forEach((el) => { el.textContent = value; });
            setText('#settingModalTitle', t.settings);
            setText('label[for="settingLanguage"]', t.language);
            setText('.setting-help-text', t.languageHelp);
            setText('#settingModalClose', t.close);
            setText('#collapseAppButton', t.collapse || UI_TRANSLATIONS.en.collapse);
            setText('#autocomplete-panel-title', t.suggestions || UI_TRANSLATIONS.en.suggestions);
            setText('#modeModalTitle', t.mode);
            setText('#modeModalClose', t.close);
            setText('.mode-choice:nth-of-type(1) strong', t.copyOnly);
            setText('.mode-choice:nth-of-type(1) small', t.copyOnlyHelp);
            setText('.mode-choice:nth-of-type(2) strong', t.pastePrevious);
            setText('.mode-choice:nth-of-type(2) small', t.pastePreviousHelp);
            setText('#helpModalTitle', t.help);
            setText('#helpModalClose', t.close);
            setText('.bind-dialog-title', t.edit);
            setText('.bind-dialog-button.secondary', t.cancel);
            setText('.bind-dialog-button.primary', t.save);
            setText('#bindNavLabelTitle', `1. ${t.navLabel}`); setText('#bindSavedTextTitle', `2. ${t.savedText}`);
            setText('#bindNavLabelHelp', t.navLabelHelp); setText('#bindSavedTextHelp', t.savedTextHelp);
            const searchEl = document.getElementById('searchInput');
            if (searchEl) searchEl.placeholder = t.search;
            const hintEl = document.querySelector('.search-section > .search-label[style*="margin-top"]');
            if (hintEl) hintEl.textContent = t.tryTyping;
            const buttonLabels = (UI_LABELS[interfaceLanguage] || UI_LABELS.en).map((label, index) => `${label} (F${index + 1})`);
            document.querySelectorAll('.fkey-row .fkey-btn').forEach((button, index) => {
                if (buttonLabels[index]) button.textContent = buttonLabels[index];
            });
            const shortcuts = SHORTCUT_LABELS[interfaceLanguage] || SHORTCUT_LABELS.en;
            setText('#webShortcutsTitle', shortcuts[0]);
            document.querySelectorAll('[data-shortcut-label]').forEach((el) => { const key = el.dataset.shortcutLabel; const index = ['search','open','copy','up','collapse'].indexOf(key) + 1; if (index) el.textContent = shortcuts[index]; });
            applyLanguageExamples();
            updateHelpModalText();
        }

        // キーボードレイアウトレジストリ（表示用 keyRows + 物理キー→文字 codeToCharMap）
        const KEYBOARD_LAYOUTS = [
            {
                id: 'qwerty',
                displayName: 'QWERTY',
                keyRows: [
                    ['1','2','3','4','5','6','7','8','9','0'],
                    ['Q','W','E','R','T','Y','U','I','O','P'],
                    ['A','S','D','F','G','H','J','K','L'],
                    ['Z','X','C','V','B','N','M']
                ],
                codeToCharMap: {
                    Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4', Digit5:'5',
                    Digit6:'6', Digit7:'7', Digit8:'8', Digit9:'9', Digit0:'0',
                    KeyQ:'q', KeyW:'w', KeyE:'e', KeyR:'r', KeyT:'t', KeyY:'y', KeyU:'u', KeyI:'i', KeyO:'o', KeyP:'p',
                    KeyA:'a', KeyS:'s', KeyD:'d', KeyF:'f', KeyG:'g', KeyH:'h', KeyJ:'j', KeyK:'k', KeyL:'l',
                    KeyZ:'z', KeyX:'x', KeyC:'c', KeyV:'v', KeyB:'b', KeyN:'n', KeyM:'m'
                }
            },
            {
                id: 'tenkey',
                displayName: 'Numpad',
                keyRows: [
                    ['7','8','9'],
                    ['4','5','6'],
                    ['1','2','3'],
                    ['0']
                ],
                codeToCharMap: {
                    Numpad0:'0', Numpad1:'1', Numpad2:'2', Numpad3:'3', Numpad4:'4',
                    Numpad5:'5', Numpad6:'6', Numpad7:'7', Numpad8:'8', Numpad9:'9',
                    Digit0:'0', Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4',
                    Digit5:'5', Digit6:'6', Digit7:'7', Digit8:'8', Digit9:'9'
                }
            },
            {
                id: 'dvorak',
                displayName: 'Dvorak',
                keyRows: [
                    ['1','2','3','4','5','6','7','8','9','0'],
                    ['P','Y','F','G','C','R','L'],
                    ['A','O','E','U','I','D','H','T','N','S'],
                    ['Q','J','K','X','B','M','W','V','Z']
                ],
                codeToCharMap: {
                    Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4', Digit5:'5',
                    Digit6:'6', Digit7:'7', Digit8:'8', Digit9:'9', Digit0:'0',
                    KeyR:'p', KeyT:'y', KeyY:'f', KeyU:'g', KeyI:'c', KeyO:'r', KeyP:'l',
                    KeyA:'a', KeyS:'o', KeyD:'e', KeyF:'u', KeyG:'i', KeyH:'d', KeyJ:'h', KeyK:'t', KeyL:'n',
                    KeyX:'q', KeyC:'j', KeyV:'k', KeyB:'x', KeyN:'b', KeyM:'m',
                    KeyComma:'w', KeyPeriod:'v', KeySlash:'z'
                }
            },
            {
                id: 'colemak',
                displayName: 'Colemak',
                keyRows: [
                    ['1','2','3','4','5','6','7','8','9','0'],
                    ['Q','W','F','P','G','J','L','U','Y'],
                    ['A','R','S','T','D','H','N','E','I','O'],
                    ['Z','X','C','V','B','K','M']
                ],
                codeToCharMap: {
                    Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4', Digit5:'5',
                    Digit6:'6', Digit7:'7', Digit8:'8', Digit9:'9', Digit0:'0',
                    KeyQ:'q', KeyW:'w', KeyF:'f', KeyP:'p', KeyG:'g', KeyJ:'j', KeyL:'l', KeyU:'u', KeyY:'y',
                    KeyA:'a', KeyR:'r', KeyS:'s', KeyT:'t', KeyD:'d', KeyH:'h', KeyN:'n', KeyE:'e', KeyI:'i', KeyO:'o',
                    KeyZ:'z', KeyX:'x', KeyC:'c', KeyV:'v', KeyB:'b', KeyK:'k', KeyM:'m'
                }
            },
            {
                id: 'jis',
                displayName: 'JIS',
                keyRows: [
                    ['1','2','3','4','5','6','7','8','9','0'],
                    ['Q','W','E','R','T','Y','U','I','O','P'],
                    ['A','S','D','F','G','H','J','K','L'],
                    ['Z','X','C','V','B','N','M']
                ],
                codeToCharMap: {
                    Digit1:'1', Digit2:'2', Digit3:'3', Digit4:'4', Digit5:'5',
                    Digit6:'6', Digit7:'7', Digit8:'8', Digit9:'9', Digit0:'0',
                    KeyQ:'q', KeyW:'w', KeyE:'e', KeyR:'r', KeyT:'t', KeyY:'y', KeyU:'u', KeyI:'i', KeyO:'o', KeyP:'p',
                    KeyA:'a', KeyS:'s', KeyD:'d', KeyF:'f', KeyG:'g', KeyH:'h', KeyJ:'j', KeyK:'k', KeyL:'l',
                    KeyZ:'z', KeyX:'x', KeyC:'c', KeyV:'v', KeyB:'b', KeyN:'n', KeyM:'m'
                }
            }
        ];

        // 1層目・2層目の設定（表示名と説明）
        const LAYER_SETTINGS = {
            1: { name: 'Level 1', label: 'Category', desc: 'A top-level group for tools, languages, or templates.' },
            2: { name: 'Level 2', label: 'Item', desc: 'A reusable prompt, command, or saved text.' }
        };
        function getLayerDepth() {
            return currentPath.length === 0 ? 1 : (currentPath.length === 1 ? 2 : currentPath.length);
        }
        function getLayerLabel() {
            const d = getLayerDepth();
            const s = LAYER_SETTINGS[d] || { name: `Level ${d}`, label: `Layer ${d}` };
            return `${s.name}（${s.label}）`;
        }
        function getLayerDepthForPath(path) {
            return path.length === 0 ? 1 : (path.length === 1 ? 2 : path.length);
        }
        function getLayerLabelForPath(path) {
            const d = getLayerDepthForPath(path);
            const s = LAYER_SETTINGS[d] || { name: `Level ${d}`, label: `Layer ${d}` };
            return `${s.name}（${s.label}）`;
        }

        function escapeHtml(str) {
            if (str == null || str === '') return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        // API呼び出しヘルパー
        async function apiCall(endpoint, options = {}) {
            try {
                const response = await fetch(`${API_BASE}${endpoint}`, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                });
                
                if (!response.ok) {
                    if (response.status === 404) {
                        // An empty local store has no root node yet. Treat the
                        // initial tree request as an empty state, not an error.
                        if (endpoint === '/tree') return {};
                        const error = new Error(`API Error: ${response.status} ${response.statusText}`);
                        error.status = 404;
                        throw error;
                    }
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                
                return await response.json();
            } catch (error) {
                if (error.status !== 404) console.error('API呼び出しエラー:', error);
                throw error;
            }
        }

        // 階層ツリーをロード
        async function loadTree() {
            try {
                const treeData = await apiCall('/tree');
                // ツリーデータを階層ツリーに完全に置き換え（マージではなく）
                hierarchyTree = treeData;
                // 各ノードのcontentLengthが設定されていない場合は計算
                Object.keys(hierarchyTree).forEach(path => {
                    const node = hierarchyTree[path];
                    if (node) {
                        // contentLengthが設定されていない場合は計算
                        if (node.contentLength === undefined) {
                            node.contentLength = node.content ? node.content.length : 0;
                        }
                        // childrenがオブジェクトでない場合は空オブジェクトに初期化
                        if (!node.children || typeof node.children !== 'object') {
                            node.children = {};
                        }
                    }
                });
                console.log('階層ツリーを読み込みました:', Object.keys(hierarchyTree));
                renderKeyboardLayout(inputMode);
                await updateDisplay();
            } catch (error) {
                console.error('階層ツリーの読み込みエラー:', error);
                alert('Failed to load the navigation tree.');
                // API失敗時もキーボードレイアウトは描画する（空のツリーで表示）
                renderKeyboardLayout(inputMode);
            }
        }

        // ノード取得
        function getNode(path) {
            return hierarchyTree[path] || { navLabel: '', content: '', contentLength: 0, children: {} };
        }

        // 入力文字列から「存在する階層まで」の最長パスを返す（キー押下と同じ：無効なキーは進まない）
        function getLongestValidPath(typed) {
            if (!typed || typed.trim() === '') return '';
            let path = '';
            for (const c of typed.trim()) {
                const node = getNode(path);
                const nextPath = node.children && node.children[c];
                if (nextPath === undefined) break;
                path = nextPath;
            }
            return path;
        }

        // why: 編集位置のキーを一意に決め、その親パスで兄弟候補を出すため
        // assumption: pathString は searchInput.value を渡す想定。カーソルは 0..pathString.length でクランプする
        function getKeyIndexFromCursor(pathString, cursorPosition) {
            if (!pathString || pathString.trim() === '') return 0;
            return Math.max(0, Math.min(cursorPosition, pathString.length));
        }

        // 階層移動
        async function navigateToPath(path) {
            // 予測選択時に「既存の検索バー＋予測」で貼り付かないよう、同期タイマーを即キャンセル
            if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
            currentPath = path;
            // 検索バーを即時反映（API成否に依存せず、キー列をそのまま表示。編集しやすいようコンマなし）
            const pathToSync = path || '';
            const searchInputEl = document.getElementById('searchInput');
            if (searchInputEl) {
                searchInputEl.value = pathToSync;
                searchInputEl.setSelectionRange(pathToSync.length, pathToSync.length);
                lastNavigateToPathAt = Date.now();
            }
            await updateDisplay();
            // ナビ完了後にカーソル末尾＋モード更新を遅延実行し、候補クリック後の stray click で edit に戻るのを上書きする
            setTimeout(() => {
                const inp = document.getElementById('searchInput');
                if (inp) {
                    inp.setSelectionRange(inp.value.length, inp.value.length);
                }
                if (typeof updateSearchMode === 'function') updateSearchMode();
            }, 0);
        }

        // 表示更新
        async function updateDisplay() {
            try {
                // 検索バー→階層の同期タイマーをキャンセル（ナビ後にデバウンスが二重適用されないように）
                if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                // 現在のノードを取得（空文字列パスの場合は特別なエンドポイントを使用）
                let current;
                try {
                    const nodeEndpoint = currentPath === '' 
                        ? '/nodes' 
                        : `/nodes/${encodeURIComponent(currentPath)}`;
                    current = await apiCall(nodeEndpoint);
                    hierarchyTree[currentPath] = current;
                } catch (error) {
                    // 404エラーの場合は空のノードを作成
                    if (error.status === 404 || error.message.includes('404')) {
                        hierarchyTree[currentPath] = { navLabel: '', content: '', contentLength: 0, children: {} };
                    } else {
                        throw error;
                    }
                }

                // 子ノードを取得してchildrenを更新
                try {
                    // 空文字列パスの場合は特別なエンドポイントを使用
                    const childrenEndpoint = currentPath === '' 
                        ? '/nodes/children' 
                        : `/nodes/${encodeURIComponent(currentPath)}/children`;
                    const children = await apiCall(childrenEndpoint);
                    const childrenMap = {};
                    children.forEach(child => {
                        const key = child.id.slice(-1);
                        childrenMap[key] = child.id;
                        // 子ノードも階層ツリーに追加（既存データを保持しつつ、contentLengthを確実に設定）
                        if (!hierarchyTree[child.id]) {
                            hierarchyTree[child.id] = {};
                        }
                        hierarchyTree[child.id].navLabel = child.navLabel || '';
                        hierarchyTree[child.id].content = child.content || '';
                        hierarchyTree[child.id].contentLength = child.contentLength !== undefined ? child.contentLength : (child.content ? child.content.length : 0);
                        // childrenは既存のデータを保持（loadTree()で設定されたデータを上書きしない）
                        if (!hierarchyTree[child.id].children || Object.keys(hierarchyTree[child.id].children).length === 0) {
                            hierarchyTree[child.id].children = {};
                        }
                    });
                    if (hierarchyTree[currentPath]) {
                        hierarchyTree[currentPath].children = childrenMap;
                    }
                } catch (error) {
                    console.error('子ノード取得エラー:', error);
                }

                // キーボードレイアウトを更新
                updateKeyboardLayout();
                
                // 設定文字列を更新
                updateContentDisplay();
                updateBreadcrumb();
                // 検索バーは navigateToPath でだけ更新する（updateDisplay で上書きしない＝遅延完了時の「入力が全部消える」バグを防ぐ）
                // 検索バーを常時使う: ナビ後は検索欄にフォーカス（ダイアログ表示中は奪わない）
                if (!document.getElementById('bindDialog').classList.contains('show')) {
                    const inp = document.getElementById('searchInput');
                    if (inp) {
                        inp.focus();
                        const len = inp.value.length;
                        inp.setSelectionRange(len, len);
                    }
                }
                if (typeof updateSearchMode === 'function') updateSearchMode();
            } catch (error) {
                console.error('表示更新エラー:', error);
            }
        }

        // 表示中のキーボードコンテナを取得（常に単一のキーボードコンテナを返す）
        function getVisibleKeyboardContainer() {
            return document.getElementById('keyboardContainer');
        }

        // キーボードレイアウトを描画（KEYBOARD_LAYOUTS の keyRows から .keyboard-row / .key を生成）
        function renderKeyboardLayout(layoutId) {
            const layout = KEYBOARD_LAYOUTS.find(l => l.id === layoutId);
            if (!layout) return;
            const container = document.getElementById('keyboardContainer');
            if (!container) return;
            container.innerHTML = '';
            for (const row of layout.keyRows) {
                const rowEl = document.createElement('div');
                rowEl.className = 'keyboard-row';
                for (const keyChar of row) {
                    const keyEl = document.createElement('div');
                    keyEl.className = 'key';
                    const capSpan = document.createElement('span');
                    capSpan.textContent = keyChar;
                    keyEl.appendChild(capSpan);
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'key-label';
                    keyEl.appendChild(labelSpan);
                    const indicatorSpan = document.createElement('span');
                    indicatorSpan.className = 'key-indicator';
                    keyEl.appendChild(indicatorSpan);
                    rowEl.appendChild(keyEl);
                }
                container.appendChild(rowEl);
            }
        }

        // キーボードレイアウト更新（表示中キーのみ）
        function updateKeyboardLayout() {
            const container = getVisibleKeyboardContainer();
            if (!container) return;
            const current = getNode(currentPath);
            const children = current.children || {};
            
            container.querySelectorAll('.key').forEach(keyEl => {
                const key = keyEl.querySelector('span').textContent.toLowerCase();
                const childPath = currentPath + key;
                const childNode = getNode(childPath);
                
                // クラスをリセット
                keyEl.classList.remove('bound', 'unbound');
                
                if (childNode && childNode.navLabel) {
                    keyEl.classList.add('bound');
                    let labelEl = keyEl.querySelector('.key-label');
                    if (!labelEl) {
                        labelEl = document.createElement('span');
                        labelEl.className = 'key-label';
                        keyEl.appendChild(labelEl);
                    }
                    labelEl.textContent = childNode.navLabel;
                } else {
                    keyEl.classList.add('unbound');
                    let labelEl = keyEl.querySelector('.key-label');
                    if (!labelEl) {
                        labelEl = document.createElement('span');
                        labelEl.className = 'key-label';
                        keyEl.appendChild(labelEl);
                    }
                    labelEl.textContent = interfaceLanguage === 'ja' ? '[未設定]' : '[Unassigned]';
                }
                
                // 文字数インジケータの更新（先に大きさ10刻み→最大で色10刻み）
                let indicatorEl = keyEl.querySelector('.key-indicator');
                if (!indicatorEl) {
                    indicatorEl = document.createElement('span');
                    indicatorEl.className = 'key-indicator';
                    keyEl.appendChild(indicatorEl);
                }
                
                // contentLengthを優先的に使用、なければcontentから計算
                const contentLength = (childNode && childNode.contentLength !== undefined) 
                    ? childNode.contentLength 
                    : (childNode && childNode.content ? childNode.content.length : 0);
                
                indicatorEl.classList.remove('empty', 'small', 'medium', 'large', 'xlarge');
                for (let i = 1; i <= 9; i++) indicatorEl.classList.remove('color-' + i);
                
                if (contentLength === 0) {
                    indicatorEl.classList.add('empty');
                } else if (contentLength <= 200) {
                    indicatorEl.classList.add('small');
                } else if (contentLength <= 400) {
                    indicatorEl.classList.add('medium');
                } else if (contentLength <= 600) {
                    indicatorEl.classList.add('large');
                } else if (contentLength <= 800) {
                    indicatorEl.classList.add('xlarge');
                } else {
                    indicatorEl.classList.add('xlarge');
                    const colorIndex = Math.min(9, Math.floor((contentLength - 801) / 200) + 1);
                    indicatorEl.classList.add('color-' + colorIndex);
                }
                // 貼り付け先キーのハイライト
                keyEl.classList.toggle('paste-target', pasteTargetKey === key);
            });
        }

        // 設定文字列表示更新（パネル内 Navラベル + 設定文字列を分けて表示。タイトルも更新）
        function updateContentDisplay() {
            const sourceNode = getNode(currentPath);
            const contentEl = document.getElementById('panelContentNav');
            const labelEl = document.getElementById('panelNavLabel');
            const stringEl = document.getElementById('panelContentString');
            const titleEl = document.getElementById('autocomplete-panel-title');
            if (!contentEl || !titleEl) return;

            // タイトル: 〇層目の〇 — Nav: 名前（未割り当てのときは全層で非表示）
            const navLabelText = sourceNode.navLabel ? `Nav: ${sourceNode.navLabel}` : (interfaceLanguage === 'ja' ? 'Nav: 未設定' : 'Nav: Unassigned');
            if (navLabelText === 'Nav: Unassigned' || navLabelText === 'Nav: 未設定') {
                titleEl.textContent = '';
            } else if (currentPath === '') {
                titleEl.textContent = getLayerLabelForPath('') + ' — ' + navLabelText;
            } else {
                const layerDepth = getLayerDepthForPath(currentPath);
                const keyAtLayer = currentPath.slice(-1);
                const layerName = (LAYER_SETTINGS[layerDepth] || { name: `${layerDepth}層目` }).name;
                titleEl.textContent = `${layerName}の${keyAtLayer} — ${navLabelText}`;
            }

            // Nav とその名前
            if (labelEl) {
                labelEl.textContent = sourceNode.navLabel ? `Nav: ${sourceNode.navLabel}` : (interfaceLanguage === 'ja' ? 'Nav: 未設定' : 'Nav: Unassigned');
            }
            // 設定文字列エリア: content のみ（クリップボード用は親の data-content）
            if (stringEl) {
                if (sourceNode.content) {
                    stringEl.textContent = sourceNode.content;
                    stringEl.style.color = '#e0e0e0';
                } else {
                    stringEl.textContent = interfaceLanguage === 'ja' ? '[未設定] Ctrl+Enterで設定' : '[Unassigned] Press Ctrl+Enter to set text';
                    stringEl.style.color = '#858585';
                }
            }
            if (sourceNode.content) {
                contentEl.setAttribute('data-content', sourceNode.content);
            } else {
                contentEl.removeAttribute('data-content');
            }
        }

        // キーフィードバックをクリアする
        function clearKeyFeedback() {
            const el = document.getElementById('keyFeedback');
            if (el) {
                el.textContent = '';
                el.classList.remove('show');
            }
            updateBreadcrumb(); // パンくず表示を復元
        }

        // パンくずナビゲーションを更新する
        function updateBreadcrumb() {
            const breadcrumbNav = document.getElementById('breadcrumbNav');
            if (!breadcrumbNav) return;

            // まずパンくずをクリア
            breadcrumbNav.innerHTML = '';
            
            // 現在のパスをセグメントに分割
            const segments = currentPath.split('/').filter(s => s !== '');

            // ルート要素を追加
            const rootItem = document.createElement('span');
            rootItem.classList.add('breadcrumb-item');
            const rootLink = document.createElement('a');
            rootLink.href = '#';
            rootLink.textContent = 'root';
            rootLink.setAttribute('aria-label', 'ルート');
            rootLink.setAttribute('tabindex', '0');
            rootLink.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToPath('');
            });
            rootLink.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigateToPath('');
                }
            });
            rootItem.appendChild(rootLink);
            breadcrumbNav.appendChild(rootItem);

            let pathAccumulator = '';
            segments.forEach((segment, index) => {
                pathAccumulator += '/' + segment;
                
                const separator = document.createElement('span');
                separator.classList.add('breadcrumb-separator');
                separator.textContent = '>';
                separator.setAttribute('aria-hidden', 'true');
                breadcrumbNav.appendChild(separator);

                const item = document.createElement('span');
                item.classList.add('breadcrumb-item');
                
                let label = '';
                const node = getNode(pathAccumulator);
                if (node.navLabel) {
                    label = node.navLabel;
                } else {
                    label = getLayerLabelForPath(pathAccumulator);
                }
                
                const sanitizedLabel = escapeHtml(label);

                if (index === segments.length - 1) {
                    // 最後の要素はリンクにせず、breadcrumb-currentクラスを適用
                    item.classList.add('breadcrumb-current');
                    item.textContent = sanitizedLabel;
                    item.setAttribute('aria-current', 'page');
                } else {
                    // それ以外の要素はリンク
                    const link = document.createElement('a');
                    link.href = '#';
                    link.textContent = sanitizedLabel;
                    link.setAttribute('aria-label', `${label} へ移動`);
                    link.setAttribute('tabindex', '0');
                    const currentSegmentPath = pathAccumulator; // クロージャのために現在のパスを保存
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        navigateToPath(currentSegmentPath);
                    });
                    link.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigateToPath(currentSegmentPath);
                        }
                    });
                    item.appendChild(link);
                }
                breadcrumbNav.appendChild(item);
            });

            // パンくずにコンテンツがあるかどうかに基づいて表示を切り替える
            if (segments.length === 0 && currentPath === '') {
                breadcrumbNav.style.display = 'none';
            } else {
                breadcrumbNav.style.display = 'flex'; // または 'block' / 'grid' など、CSSで定義した表示スタイル
            }
        }

        // クリップボードにコピー
        async function copyToClipboard(text) {
            if (!text || text === '[Unassigned] Press Ctrl+Enter to set text' || text === '[未設定] Ctrl+Enterで設定') return false;
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                // フォールバック: 古いブラウザ対応
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    return true;
                } catch (e) {
                    document.body.removeChild(textArea);
                    return false;
                }
            }
        }

        // Tauriでは呼び出し前のアプリへ戻り、クリップボード内容を貼り付ける。
        async function copyAndPasteToPreviousWindow(text) {
            const success = await copyToClipboard(text);
            if (!success) return false;
            const invoke = window.__TAURI__?.core?.invoke;
            if (invoke && pasteMode === 'copy-paste') {
                try { await invoke('paste_to_previous_window'); }
                catch (err) { console.warn('貼り付けに失敗しました:', err); }
                setMarkerCollapsed(true);
            }
            return true;
        }

        function setMarkerCollapsed(collapsed) {
            document.body.classList.toggle('marker-collapsed', collapsed);
        }

        function collapseMineparser() {
            setMarkerCollapsed(true);
            if (window.parent !== window) {
                window.parent.postMessage({ type: 'mineparser-close' }, '*');
            }
            const invoke = window.__TAURI__?.core?.invoke;
            if (invoke) invoke('collapse_marker').catch((err) => console.warn('Mineparserを閉じられませんでした:', err));
        }

        function hasOpenOverlay() {
            return ['helpModalOverlay', 'tenkeyModalOverlay', 'settingModalOverlay', 'modeModalOverlay']
                .some((id) => document.getElementById(id)?.classList.contains('show')) ||
                document.getElementById('bindDialog')?.classList.contains('show');
        }

        // Capture Escape before input-specific handlers so the workspace can always be collapsed.
        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || hasOpenOverlay()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            collapseMineparser();
        }, true);

        async function expandMineparser(fromMarker = false) {
            setMarkerCollapsed(false);
            const invoke = window.__TAURI__?.core?.invoke;
            if (!invoke) return;
            try {
                await invoke(fromMarker ? 'prepare_show_from_marker' : 'prepare_show');
            } catch (err) {
                console.warn('Mineparserの表示に失敗しました:', err);
            }
        }

        const launcherMarkerEl = document.getElementById('launcherMarker');
        if (launcherMarkerEl) launcherMarkerEl.addEventListener('click', () => expandMineparser(true));
        const collapseAppButtonEl = document.getElementById('collapseAppButton');
        if (collapseAppButtonEl) collapseAppButtonEl.addEventListener('click', collapseMineparser);
        const isExtensionApp = document.body.classList.contains('extension-mode');
        const isWebApp = !window.__TAURI__;
        if (isWebApp && !isExtensionApp) document.body.classList.add('web-mode');
        else document.body.classList.add('tauri-mode');
        setMarkerCollapsed(!isWebApp && !isExtensionApp);
        if (isWebApp) setTimeout(() => document.getElementById('searchInput')?.focus(), 80);

        const tauriListen = window.__TAURI__?.event?.listen;
        if (tauriListen) tauriListen('mineparser:expanded', () => setMarkerCollapsed(false));

        // コピー成功時の視覚的フィードバック（パネル内 Nav の場合は設定文字列エリアのみメッセージ表示）
        function showCopyFeedback(element, success) {
            if (success === undefined) success = true;
            element.classList.remove('copy-feedback', 'copy-feedback-error');
            element.classList.add(success ? 'copy-feedback' : 'copy-feedback-error');
            const stringEl = element.id === 'panelContentNav' ? document.getElementById('panelContentString') : null;
            const targetEl = stringEl || element;
            const originalText = targetEl.textContent;
            const originalData = element.getAttribute('data-content');
            targetEl.setAttribute('data-feedback-original', originalText || '');
            targetEl.textContent = success ? 'Copied' : 'Copy failed';
            setTimeout(() => {
                element.classList.remove('copy-feedback', 'copy-feedback-error');
                const restored = targetEl.getAttribute('data-feedback-original');
                targetEl.removeAttribute('data-feedback-original');
                if (restored !== null) targetEl.textContent = restored;
                if (originalData !== null) element.setAttribute('data-content', originalData);
                else element.removeAttribute('data-content');
            }, 450);
        }

        // 未割り当てキー押下時のエラー表示（設定ダイアログは開かず、キーバインドで開く旨を案内）
        // 該当キーを一瞬赤くする（表示中のキーボード内のキーのみ対象）
        function showKeyError(keyChar) {
            const bc = document.getElementById('breadcrumbNav');
            if (bc) bc.style.display = 'none';
            const keyCharNorm = keyChar.toLowerCase();
            const container = getVisibleKeyboardContainer();
            if (!container) return;
            container.querySelectorAll('.key').forEach(keyEl => {
                const char = keyEl.querySelector('span')?.textContent?.trim()?.toLowerCase();
                if (char === keyCharNorm) {
                    keyEl.classList.add('key-error');
                    clearTimeout(keyEl._errorTid);
                    keyEl._errorTid = setTimeout(() => {
                        keyEl.classList.remove('key-error');
                    }, 300);
                }
            });
            const el = document.getElementById('keyFeedback');
            if (!el) return;
            el.textContent = `Key "${keyChar}" is unassigned. Press Ctrl+Alt+${keyChar} to configure it.`;
            el.classList.add('show');
            clearTimeout(showKeyError._tid);
            showKeyError._tid = setTimeout(() => {
                clearKeyFeedback();
            }, 3500);
        }

        // キーボードクリック時の処理（イベント委譲：表示中・非表示のどちらのキーでも同じ handleKeyPress が動く）
        const keyboardSectionEl = document.getElementById('keyboardSection');
        if (keyboardSectionEl) {
            keyboardSectionEl.addEventListener('click', (e) => {
                const keyEl = e.target.closest('.key');
                if (!keyEl) return;
                const span = keyEl.querySelector('span');
                const keyChar = span?.textContent?.trim()?.toLowerCase();
                if (keyChar) handleKeyPress(keyChar);
            });
        }

        // キー入力処理（未割り当てのときはエラー表示のみ。設定は Ctrl+Alt+英数字 で開く）
        async function handleKeyPress(keyChar) {
            const newPath = currentPath + keyChar;
            const childNode = getNode(newPath);
            
            if (childNode && childNode.navLabel) {
                // 設定済みキー: 階層を移動
                await navigateToPath(newPath);
            } else {
                // 未割り当てキー: エラー表示（設定ダイアログは開かない）
                showKeyError(keyChar);
                // 検索バー→階層の同期タイマーをキャンセルし、検索バーを現在階層に合わせる（無効キー押下後に1層目に戻るのを防ぐ）
                if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                const searchInputEl = document.getElementById('searchInput');
                if (searchInputEl) {
                    const current = getNode(currentPath);
                    // ルート時は常に空白
                    const displayValue = (currentPath && currentPath.length > 0)
                        ? currentPath
                        : '';
                    searchInputEl.value = displayValue;
                }
            }
        }

        // 設定ダイアログを開く
        async function openBindDialog(key) {
            const dialogEl = document.getElementById('bindDialog');
            const navLabelInput = document.getElementById('bindNavLabelInput');
            const contentInput = document.getElementById('bindContentInput');
            if (!dialogEl || !navLabelInput || !contentInput) return;
            const newPath = currentPath + key;
            const existingNode = getNode(newPath);
            const keyNameEl = document.getElementById('bindKeyName');
            const layerNameEl = document.getElementById('bindLayerName');
            const currentPathEl = document.getElementById('bindCurrentPath');
            if (keyNameEl) keyNameEl.textContent = key;
            if (layerNameEl) layerNameEl.textContent = getLayerLabelForPath(newPath);
            if (currentPathEl) currentPathEl.textContent = currentPath || '';
            navLabelInput.value = existingNode?.navLabel || '';
            contentInput.value = existingNode?.content || '';
            dialogEl.setAttribute('data-target-path', newPath);
            dialogEl.classList.add('show');
            navLabelInput.focus();
        }

        /** 現在の階層のナビ・設定文字列を編集するため、キーバインド設定モーダルを開く（右パネルは表示専用のため編集はモーダルで行う） */
        function openBindDialogForCurrentPath() {
            const current = getNode(currentPath);
            const keyNameEl = document.getElementById('bindKeyName');
            const currentPathEl = document.getElementById('bindCurrentPath');
            const navLabelInputEl = document.getElementById('bindNavLabelInput');
            const contentInputEl = document.getElementById('bindContentInput');
            const dialogEl = document.getElementById('bindDialog');
            if (keyNameEl) keyNameEl.textContent = '[現在の階層]';
            if (currentPathEl) currentPathEl.textContent = currentPath || '';
            if (navLabelInputEl) navLabelInputEl.value = current ? (current.navLabel || '') : '';
            if (contentInputEl) contentInputEl.value = current ? (current.content || '') : '';
            if (dialogEl) {
                dialogEl.setAttribute('data-target-path', currentPath);
                dialogEl.classList.add('show');
            }
            if (contentInputEl) contentInputEl.focus();
        }

        // 設定ダイアログを閉じる
        function closeBindDialog() {
            const el = document.getElementById('bindDialog');
            if (el) el.classList.remove('show');
        }

        // ヘルプモーダル内のショートカット表記をモード（QWERTY/テンキー）に応じて更新、Fキー行ラベルは固定（F1=ヘルプ等）
        function updateHelpModalText() {
            const titleEl = document.getElementById('helpModalTitle');
            const altLineEl = document.getElementById('helpLineAltKey');
            const ctrlAltLineEl = document.getElementById('helpLineCtrlAltKey');
            const unassignedLineEl = document.getElementById('helpLineUnassignedKey');
            const japanese = interfaceLanguage === 'ja';
            if (inputMode === 'tenkey') {
                if (titleEl) titleEl.textContent = japanese ? 'この階層で使える操作' : 'Commands available at this level';
                if (altLineEl) altLineEl.innerHTML = japanese ? '<kbd>Alt</kbd>+<kbd>数字キー</kbd> 貼り付け先を選び、<kbd>Enter</kbd> で文字列を貼り付け' : '<kbd>Alt</kbd>+<kbd>number</kbd> Select a paste target, then press <kbd>Enter</kbd> to paste';
                if (ctrlAltLineEl) ctrlAltLineEl.innerHTML = japanese ? '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>数字キー</kbd> そのキーを設定' : '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>number</kbd> Configure that key';
            } else {
                if (titleEl) titleEl.textContent = japanese ? 'この階層で使える操作' : 'Commands available at this level';
                if (altLineEl) altLineEl.innerHTML = japanese ? '<kbd>Alt</kbd>+<kbd>英数字キー</kbd> 貼り付け先を選び、<kbd>Enter</kbd> で文字列を貼り付け' : '<kbd>Alt</kbd>+<kbd>alphanumeric</kbd> Select a paste target, then press <kbd>Enter</kbd> to paste';
                if (ctrlAltLineEl) ctrlAltLineEl.innerHTML = japanese ? '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>英数字キー</kbd> そのキーを設定' : '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>alphanumeric</kbd> Configure that key';
            }
            if (unassignedLineEl) unassignedLineEl.innerHTML = japanese ? '未設定キーは <kbd>Ctrl</kbd>+<kbd>Enter</kbd> またはキーボード上のキークリックで設定' : 'Configure an unassigned key with <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or by clicking it.';
            // Fキー行: F1=ヘルプ, F2=エクスポート, F3=インポート, F4=テンキー, F5=設定, F6=モード
            document.querySelectorAll('.fkey-row .fkey-btn').forEach(function(btn) {
                const f = parseInt(btn.getAttribute('data-f'), 10);
                if (f === 1) {
                    btn.textContent = japanese ? 'ヘルプ (F1)' : 'Help (F1)';
                    btn.className = 'fkey-btn fkey-btn-help';
                    btn.setAttribute('title', japanese ? 'ヘルプ (F1)' : 'Help (F1)');
                    btn.setAttribute('aria-label', 'Show help (F1)');
                } else if (f === 2) {
                    btn.textContent = japanese ? 'エクスポート (F2)' : 'Export (F2)';
                    btn.className = 'fkey-btn fkey-btn-export';
                    btn.setAttribute('title', 'Export (F2)');
                    btn.setAttribute('aria-label', 'Export (F2)');
                } else if (f === 3) {
                    btn.textContent = japanese ? 'インポート (F3)' : 'Import (F3)';
                    btn.className = 'fkey-btn fkey-btn-import';
                    btn.setAttribute('title', 'Import (F3)');
                    btn.setAttribute('aria-label', 'Import (F3)');
                } else if (f === 4) {
                    btn.textContent = japanese ? 'キーボード (F4)' : 'Keyboard (F4)';
                    btn.className = 'fkey-btn fkey-btn-tenkey';
                    btn.setAttribute('title', 'Keyboard (F4)');
                    btn.setAttribute('aria-label', 'Keyboard (F4)');
                } else if (f === 5) {
                    btn.textContent = japanese ? '設定 (F5)' : 'Settings (F5)';
                    btn.className = 'fkey-btn fkey-btn-setting';
                    btn.setAttribute('title', 'Setting (F5)');
                    btn.setAttribute('aria-label', 'Setting (F5)');
                } else if (f === 6) {
                    btn.textContent = japanese ? 'モード (F6)' : 'Mode (F6)';
                    btn.className = 'fkey-btn fkey-btn-mode';
                    btn.setAttribute('title', 'Mode (F6) モード選択');
                    btn.setAttribute('aria-label', 'Mode (F6) モード選択');
                }
            });
            const localizedLabels = UI_LABELS[interfaceLanguage] || UI_LABELS.en;
            document.querySelectorAll('.fkey-row .fkey-btn').forEach(function(btn, index) {
                if (localizedLabels[index]) {
                    btn.textContent = `${localizedLabels[index]} (F${index + 1})`;
                    btn.setAttribute('title', `${localizedLabels[index]} (F${index + 1})`);
                    btn.setAttribute('aria-label', `${localizedLabels[index]} (F${index + 1})`);
                }
            });
        }

        function resizeKeyboardToPreview() {
            const section = document.getElementById('keyboardSection');
            const keyboard = document.getElementById('keyboardContainer');
            if (!section || !keyboard) return;
            const keyboardMaxWidth = 900;
            const available = Math.max(180, Math.min(keyboardMaxWidth, section.clientWidth) - 2);
            // Ten keys plus nine gaps must fit inside the keyboard surface.
            const keySize = Math.max(18, Math.min(86, (available - 18) / 10));
            keyboard.style.setProperty('--key-size', `${keySize}px`);
            keyboard.style.setProperty('--keyboard-width', `${Math.min(keyboardMaxWidth, keySize * 10 + 18)}px`);
        }

        const keyboardResizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeKeyboardToPreview) : null;
        if (keyboardResizeObserver) keyboardResizeObserver.observe(document.getElementById('keyboardSection'));
        window.addEventListener('resize', resizeKeyboardToPreview);
        setTimeout(resizeKeyboardToPreview, 0);

        // エクスポート: /api/export を取得してJSONファイルとしてダウンロード
        async function doExport() {
            try {
                const res = await fetch(`${API_BASE}/export`);
                if (!res.ok) throw new Error(res.statusText);
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                a.download = 'export_' + ts + '.json';
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('エクスポートエラー:', err);
                alert('Export failed: ' + err.message);
            }
        }

        // インポート: ファイル選択 → /api/import にPOST → ツリー再読み込み（F3またはラベルクリックでファイル選択）
        function doImport() {
            const input = document.getElementById('importFileInput');
            if (input) {
                input.value = '';
                input.click();
                // 一部環境で programmatic click がブロックされる場合のフォールバック: ラベルにフォーカスし Enter で開けるようにする
                const label = document.querySelector('label[for="importFileInput"]');
                if (label) label.focus();
            }
        }
        (function setupImportFileInput() {
            const input = document.getElementById('importFileInput');
            if (!input) return;
            input.addEventListener('change', async function() {
                const file = input.files && input.files[0];
                input.value = '';
                if (!file) return;
                try {
                    const text = await new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(r.result);
                        r.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
                        r.readAsText(file, 'utf-8');
                    });
                    const payload = JSON.parse(text);
                    if (payload.schema_version == null || !Array.isArray(payload.nodes)) {
                        alert('Invalid format. schema_version and nodes are required.');
                        return;
                    }
                    const res = await fetch(`${API_BASE}/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const result = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        alert('Import failed: ' + (result.error || res.statusText));
                        return;
                    }
                    await loadTree();
                    if (typeof updateDisplay === 'function') await updateDisplay();
                    alert('Import completed.');
                } catch (err) {
                    console.error('インポートエラー:', err);
                    alert('Import failed: ' + err.message);
                }
            });
        })();

        // ヘルプモーダルを開く
        function openHelpModal() {
            updateHelpModalText();
            const el = document.getElementById('helpModalOverlay');
            if (!el) return;
            el.classList.add('show');
            el.setAttribute('aria-hidden', 'false');
        }
        // ヘルプモーダルを閉じる
        function closeHelpModal() {
            const el = document.getElementById('helpModalOverlay');
            if (!el) return;
            el.classList.remove('show');
            el.setAttribute('aria-hidden', 'true');
        }

        // テンキー設定モーダルを開く（F4）— レジストリからボタンを動的生成
        function openTenkeySettingsModal() {
            const choicesEl = document.getElementById('tenkeyModalChoices');
            if (choicesEl) {
                choicesEl.innerHTML = '';
                KEYBOARD_LAYOUTS.forEach(layout => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.setAttribute('data-layout-id', layout.id);
                    btn.textContent = layout.displayName;
                    const isActive = inputMode === layout.id;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                    choicesEl.appendChild(btn);
                });
            }
            const el = document.getElementById('tenkeyModalOverlay');
            if (!el) return;
            el.classList.add('show');
            el.setAttribute('aria-hidden', 'false');
        }
        // テンキー設定モーダルを閉じる
        function closeTenkeySettingsModal() {
            const el = document.getElementById('tenkeyModalOverlay');
            if (!el) return;
            el.classList.remove('show');
            el.setAttribute('aria-hidden', 'true');
        }

        // 設定モーダルを開く（F5）
        function openSettingModal() {
            const el = document.getElementById('settingModalOverlay');
            if (!el) return;
            const languageSelect = document.getElementById('settingLanguage');
            if (languageSelect) languageSelect.value = interfaceLanguage;
            el.classList.add('show');
            el.setAttribute('aria-hidden', 'false');
        }
        // 設定モーダルを閉じる
        function closeSettingModal() {
            const el = document.getElementById('settingModalOverlay');
            if (!el) return;
            el.classList.remove('show');
            el.setAttribute('aria-hidden', 'true');
        }

        // モードモーダルを開く（F6）
        function openModeModal() {
            const el = document.getElementById('modeModalOverlay');
            if (!el) return;
            el.querySelectorAll('input[name="pasteMode"]').forEach((input) => { input.checked = input.value === pasteMode; });
            el.classList.add('show');
            el.setAttribute('aria-hidden', 'false');
        }
        // モードモーダルを閉じる
        function closeModeModal() {
            const el = document.getElementById('modeModalOverlay');
            if (!el) return;
            el.classList.remove('show');
            el.setAttribute('aria-hidden', 'true');
        }

        // ヘルプモーダル: オーバーレイクリック・閉じるボタン・ヒントクリック
        const helpModalOverlayEl = document.getElementById('helpModalOverlay');
        if (helpModalOverlayEl) helpModalOverlayEl.addEventListener('click', (e) => {
            if (e.target.id === 'helpModalOverlay') closeHelpModal();
        });
        const helpModalCloseEl = document.getElementById('helpModalClose');
        if (helpModalCloseEl) helpModalCloseEl.addEventListener('click', closeHelpModal);
        // テンキー設定モーダル: オーバーレイクリック・閉じる・選択で閉じる
        const tenkeyModalOverlayEl = document.getElementById('tenkeyModalOverlay');
        if (tenkeyModalOverlayEl) tenkeyModalOverlayEl.addEventListener('click', (e) => {
            if (e.target.id === 'tenkeyModalOverlay') closeTenkeySettingsModal();
        });
        const tenkeyModalCloseEl = document.getElementById('tenkeyModalClose');
        if (tenkeyModalCloseEl) tenkeyModalCloseEl.addEventListener('click', closeTenkeySettingsModal);
        const tenkeyModalChoicesEl = document.getElementById('tenkeyModalChoices');
        if (tenkeyModalChoicesEl) tenkeyModalChoicesEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-layout-id]');
            if (btn) {
                setInputMode(btn.getAttribute('data-layout-id'));
                closeTenkeySettingsModal();
            }
        });
        // 設定モーダル: オーバーレイクリック・閉じるボタン
        const settingModalOverlayEl = document.getElementById('settingModalOverlay');
        if (settingModalOverlayEl) settingModalOverlayEl.addEventListener('click', (e) => {
            if (e.target.id === 'settingModalOverlay') closeSettingModal();
        });
        const settingModalCloseEl = document.getElementById('settingModalClose');
        if (settingModalCloseEl) settingModalCloseEl.addEventListener('click', closeSettingModal);
        const settingLanguageEl = document.getElementById('settingLanguage');
        const autostartEl = document.getElementById('settingAutostart');
        const tauriInvoke = window.__TAURI__?.core?.invoke;
        if (autostartEl && tauriInvoke) {
            tauriInvoke('get_autostart').then((enabled) => { autostartEl.checked = Boolean(enabled); }).catch(() => {
                autostartEl.checked = localStorage.getItem('mineparser.autostart') === 'true';
            });
            autostartEl.addEventListener('change', async (event) => {
                const enabled = event.target.checked;
                localStorage.setItem('mineparser.autostart', String(enabled));
                try { await tauriInvoke('set_autostart', { enabled }); }
                catch (err) { event.target.checked = !enabled; console.warn('オート起動設定を保存できませんでした:', err); }
            });
        }
        function applyLanguageExamples() {
            const examples = {
                en: ['Type to search or navigate...', 'Example: Rust, debug, deploy', 'Example: Rust: reproduce → isolate\nfn main() {\n    // debugging code\n}'],
                ja: ['検索または移動...', '例: Rust、デバッグ、デプロイ', '例: Rust: 再現 → 切り分け\nfn main() {\n    // デバッグコード\n}'],
                'zh-CN': ['搜索或导航...', '示例：Rust、调试、部署', '示例：Rust：复现 → 隔离\nfn main() {\n    // 调试代码\n}'],
                'zh-TW': ['搜尋或導覽...', '範例：Rust、除錯、部署', '範例：Rust：重現 → 隔離\nfn main() {\n    // 除錯程式碼\n}'],
                ko: ['검색 또는 탐색...', '예: Rust, 디버그, 배포', '예: Rust: 재현 → 격리\nfn main() {\n    // 디버깅 코드\n}'],
                es: ['Buscar o navegar...', 'Ejemplo: Rust, depurar, desplegar', 'Ejemplo: Rust: reproducir → aislar\nfn main() {\n    // código de depuración\n}'],
                fr: ['Rechercher ou naviguer...', 'Exemple : Rust, déboguer, déployer', 'Exemple : Rust : reproduire → isoler\nfn main() {\n    // code de débogage\n}'],
                de: ['Suchen oder navigieren...', 'Beispiel: Rust, debuggen, bereitstellen', 'Beispiel: Rust: reproduzieren → isolieren\nfn main() {\n    // Debug-Code\n}'],
                pt: ['Pesquisar ou navegar...', 'Exemplo: Rust, depurar, publicar', 'Exemplo: Rust: reproduzir → isolar\nfn main() {\n    // código de depuração\n}'],
                it: ['Cerca o naviga...', 'Esempio: Rust, debug, deploy', 'Esempio: Rust: riprodurre → isolare\nfn main() {\n    // codice di debug\n}'],
                ru: ['Поиск или навигация...', 'Пример: Rust, отладка, развёртывание', 'Пример: Rust: воспроизвести → изолировать\nfn main() {\n    // код отладки\n}'],
                hi: ['खोजें या नेविगेट करें...', 'उदाहरण: Rust, डीबग, डिप्लॉय', 'उदाहरण: Rust: पुनरुत्पादन → अलग करना\nfn main() {\n    // डीबग कोड\n}'],
                ar: ['بحث أو تنقل...', 'مثال: Rust، تصحيح، نشر', 'مثال: Rust: إعادة الإنتاج → العزل\nfn main() {\n    // كود التصحيح\n}']
            }[interfaceLanguage] || null;
            const searchEl = document.getElementById('searchInput');
            const navEl = document.getElementById('bindNavLabelInput');
            const contentEl = document.getElementById('bindContentInput');
            const [search, nav, content] = examples || ['Type to search or navigate...', 'Example: Rust, debug, deploy', 'Example: Rust: reproduce → isolate\nfn main() {\n    // debugging code\n}'];
            if (searchEl) searchEl.placeholder = search;
            if (navEl) navEl.placeholder = nav;
            if (contentEl) contentEl.placeholder = content;
        }
        applyUiLanguage();
        if (settingLanguageEl) settingLanguageEl.addEventListener('change', (event) => {
            interfaceLanguage = event.target.value;
            localStorage.setItem('mineparser.interfaceLanguage', interfaceLanguage);
            applyUiLanguage();
            updateDisplay();
        });
        // モードモーダル: オーバーレイクリック・閉じるボタン
        const modeModalOverlayEl = document.getElementById('modeModalOverlay');
        if (modeModalOverlayEl) modeModalOverlayEl.addEventListener('click', (e) => {
            if (e.target.id === 'modeModalOverlay') closeModeModal();
        });
        const modeModalCloseEl = document.getElementById('modeModalClose');
        if (modeModalCloseEl) modeModalCloseEl.addEventListener('click', closeModeModal);
        document.querySelectorAll('input[name="pasteMode"]').forEach((input) => input.addEventListener('change', (event) => {
            pasteMode = event.target.value;
            localStorage.setItem('mineparser.pasteMode', pasteMode);
        }));
        // F1〜F6 ボタン行: F1=ヘルプ, F2=エクスポート, F3=インポート, F4=テンキー設定, F5=設定, F6=モード
        const fkeyRowEl = document.querySelector('.fkey-row');
        if (fkeyRowEl) {
            fkeyRowEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.fkey-btn');
                if (!btn) return;
                const f = parseInt(btn.getAttribute('data-f'), 10);
                if (f === 2) { doExport(); return; }
                if (f === 3) { doImport(); return; }
                if (f === 1) openHelpModal();
                if (f === 4) openTenkeySettingsModal();
                if (f === 5) openSettingModal();
                if (f === 6) openModeModal();
            });
            fkeyRowEl.addEventListener('keydown', (e) => {
                const btn = e.target.closest('.fkey-btn');
                if (!btn || (e.key !== 'Enter' && e.key !== ' ')) return;
                const f = parseInt(btn.getAttribute('data-f'), 10);
                if (f === 2) { e.preventDefault(); doExport(); return; }
                if (f === 3) { e.preventDefault(); doImport(); return; }
                if (f === 1) { e.preventDefault(); openHelpModal(); }
                if (f === 4) { e.preventDefault(); openTenkeySettingsModal(); }
                if (f === 5) { e.preventDefault(); openSettingModal(); }
                if (f === 6) { e.preventDefault(); openModeModal(); }
            });
        }
        // 初回表示でFキー行のラベルを反映
        updateHelpModalText();

        // モード切替（レイアウトID指定）— 描画してからモーダル内ボタンの表示を同期
        function setInputMode(layoutId) {
            inputMode = layoutId;
            localStorage.setItem('mineparser.inputMode', inputMode);
            const section = document.getElementById('keyboardSection');
            if (section) section.dataset.mode = layoutId;
            renderKeyboardLayout(layoutId);
            // モーダルが開いていれば #tenkeyModalChoices 内のボタンの aria-pressed / .active を更新
            const choicesEl = document.getElementById('tenkeyModalChoices');
            if (choicesEl) {
                choicesEl.querySelectorAll('button[data-layout-id]').forEach(btn => {
                    const isActive = btn.getAttribute('data-layout-id') === layoutId;
                    btn.classList.toggle('active', isActive);
                    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
            }
            updateKeyboardLayout();
            updateHelpModalText();
        }

        // 設定を保存（ナビラベル＋内容の両方をセット）
        async function saveBind() {
            const dialogEl = document.getElementById('bindDialog');
            const navLabelInput = document.getElementById('bindNavLabelInput');
            const contentInput = document.getElementById('bindContentInput');
            if (!dialogEl || !navLabelInput || !contentInput) return;
            const targetPath = dialogEl.getAttribute('data-target-path');
            const navLabelTrimmed = navLabelInput.value.trim();
            const content = contentInput.value;
            // 現在の階層のみ内容だけの更新を許可（ナビラベルは既存を維持）
            const navLabel = navLabelTrimmed || (targetPath === currentPath ? (getNode(currentPath).navLabel || '') : '');
            
            // ルート（targetPath === ''）はナビ未入力でも保存可能。子ノードのみナビ必須
            if (!navLabel && targetPath !== '') {
                alert('Please enter a navigation label.');
                return;
            }
            
            try {
                // APIでノードを保存（navLabel と content の両方をセット）。ルートは POST /api/nodes を使用
                const nodeEndpoint = targetPath === '' ? '/nodes' : `/nodes/${encodeURIComponent(targetPath)}`;
                await apiCall(nodeEndpoint, {
                    method: 'POST',
                    body: JSON.stringify({ navLabel, content })
                });
                
                // 階層ツリーを再読み込み
                await loadTree();
                
                // 現在の階層にいる場合は表示を更新
                if (targetPath === currentPath) {
                    await updateDisplay();
                } else {
                    // キーボードレイアウトを更新
                    updateKeyboardLayout();
                }
                
                closeBindDialog();
            } catch (error) {
                console.error('保存エラー:', error);
                alert('Save failed: ' + error.message);
            }
        }

        // 検索・補完
        const searchInput = document.getElementById('searchInput');
        const autocomplete = document.getElementById('autocomplete');
        let selectedIndex = 0;
        let lastAutocompleteResults = []; // キーバインドでEnter選択するために保持（ノード or 操作コマンドの統合リスト）
        let pasteTargetKey = null; // Alt+キーで選んだ貼り付け先のキー（例: 'q'）
        let focusAutocompleteTimeout = null; // フォーカス時の補完表示遅延（連続クリックでドロップダウンを誤クリックしないため）

        // 検索欄入力制限: 許可 a-z, 0-9, 非ASCII（日本語等）。禁止は記号・A-Z・スペース（検索で問題になるためスペースは入力不可）。
        // フォールバックは CAPS LOCK オンかつ Shift 押下時のみ: Shift+Digit0..9 → 0..9, Shift+KeyA..Z → a..z。それ以外では禁止文字はブロックのみ。
        const SEARCH_ALLOWED_ASCII = /^[a-z0-9]$/;
        function getSearchFallbackFromCode(code, shiftKey) {
            if (!shiftKey || !code) return null;
            const digitMatch = /^Digit([0-9])$/.exec(code);
            if (digitMatch) return digitMatch[1];
            const keyMatch = /^Key([A-Z])$/.exec(code);
            if (keyMatch) return keyMatch[1].toLowerCase();
            return null;
        }
        function isSearchCharAllowed(c) {
            if (typeof c !== 'string' || c.length !== 1) return false;
            return SEARCH_ALLOWED_ASCII.test(c);
        }
        function filterSearchInputValue(str) {
            if (typeof str !== 'string') return '';
            return str.split('').filter(isSearchCharAllowed).join('');
        }
        function insertAtCursor(inputEl, char) {
            if (!inputEl || typeof char !== 'string' || char.length !== 1) return;
            const start = inputEl.selectionStart ?? inputEl.value.length;
            const end = inputEl.selectionEnd ?? start;
            const v = inputEl.value;
            const newVal = v.slice(0, start) + char + v.slice(end);
            inputEl.value = newVal;
            const pos = start + 1;
            inputEl.setSelectionRange(pos, pos);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 操作コマンド一覧（検索欄の補完に表示し、選択で実行）
        const OPERATION_COMMANDS = [
            { id: 'nav-up', label: '階層を戻る', shortcut: 'Backspace / Alt+←', action: () => { if (currentPath.length > 0) navigateToPath(currentPath.slice(0, -1)); } },
            { id: 'help', label: 'ヘルプを表示', shortcut: 'F1', action: () => openHelpModal() },
            { id: 'focus-search', label: '検索にフォーカス', shortcut: 'Ctrl+K', action: () => { if (searchInput) searchInput.focus(); } },
            { id: 'copy-clipboard', label: '設定文字列をクリップボードにコピー（使う）', shortcut: 'Ctrl+C / Enter', action: async () => { const contentEl = document.getElementById('panelContentNav'); if (!contentEl) return; const content = contentEl.getAttribute('data-content'); if (content) { const success = await copyAndPasteToPreviousWindow(content); showCopyFeedback(contentEl, success); } } },
            { id: 'edit-current', label: '現在の階層を編集', shortcut: 'Ctrl+Shift+N', action: () => { const current = getNode(currentPath); const keyNameEl = document.getElementById('bindKeyName'); const currentPathEl = document.getElementById('bindCurrentPath'); const navLabelInputEl = document.getElementById('bindNavLabelInput'); const contentInputEl = document.getElementById('bindContentInput'); const dialogEl = document.getElementById('bindDialog'); if (keyNameEl) keyNameEl.textContent = '[現在の階層]'; if (currentPathEl) currentPathEl.textContent = currentPath || ''; if (navLabelInputEl) navLabelInputEl.value = current ? current.navLabel || '' : ''; if (contentInputEl) contentInputEl.value = current ? current.content || '' : ''; if (dialogEl) { dialogEl.setAttribute('data-target-path', currentPath); dialogEl.classList.add('show'); } if (navLabelInputEl) navLabelInputEl.focus(); } },
            { id: 'close-dialog', label: 'ダイアログを閉じる', shortcut: 'Escape', action: () => closeBindDialog() }
        ];

        function getOperationCommandsFiltered(query) {
            const q = (query || '').trim().toLowerCase();
            const shortcutFor = (c) => c.shortcut;
            if (q.length === 0) return OPERATION_COMMANDS.map(c => ({ type: 'command', ...c, shortcut: shortcutFor(c) }));
            return OPERATION_COMMANDS
                .filter(c => (c.label.toLowerCase().includes(q) || (shortcutFor(c) && shortcutFor(c).toLowerCase().includes(q))))
                .map(c => ({ type: 'command', ...c, shortcut: shortcutFor(c) }));
        }

        // 現在階層の子ノードをキーボード順で取得（検索とバインドを同期）
        function getCurrentLayerBindItems() {
            const keyEls = document.querySelectorAll('.key');
            const items = [];
            for (const keyEl of keyEls) {
                const span = keyEl.querySelector('span');
                if (!span) continue;
                const keyChar = span.textContent.trim().toLowerCase();
                const childPath = currentPath + keyChar;
                const node = getNode(childPath);
                if (node && node.navLabel) {
                    items.push({ type: 'node', id: childPath, navLabel: node.navLabel, keyChar });
                }
            }
            return items;
        }

        // 任意のパスでの階層のバインドを取得（予測パスが到達した階層での候補用）
        function getLayerBindItems(path) {
            const items = [];
            const node = getNode(path);
            if (!node || !node.children) return items;
            
            // childrenオブジェクトから子ノードを取得
            Object.keys(node.children).forEach(keyChar => {
                const childPath = node.children[keyChar];
                const childNode = getNode(childPath);
                if (childNode && childNode.navLabel) {
                    items.push({ 
                        type: 'node', 
                        id: childPath, 
                        navLabel: childNode.navLabel, 
                        keyChar: keyChar,
                        layerPath: path // どの階層での候補かを記録
                    });
                }
            });
            return items;
        }

        // 現在階層のバインドをクエリでフィルタ（キーバインド候補用）
        function getCurrentLayerBindItemsFiltered(query) {
            const items = getCurrentLayerBindItems();
            const q = (query || '').trim().toLowerCase();
            if (q.length === 0) return items.map(i => ({ type: 'node', ...i }));
            
            // 入力文字列に基づいてフィルタ（ラベルまたはキー文字で一致）
            return items
                .filter(i => (i.navLabel && i.navLabel.toLowerCase().includes(q)) || (i.keyChar && i.keyChar.includes(q)))
                .map(i => ({ type: 'node', ...i }));
        }

        // 編集モードの予測変換: ツリー接続のキーバインド候補のみ（操作コマンドは含めない）
        function getEmptySearchAutocompleteItems() {
            const bindItems = getCurrentLayerBindItems();
            return bindItems.map(i => ({ type: 'node', ...i }));
        }

        // キーバインド候補: 文字列とカーソル位置から「このキーを別キーに変えたとき」の兄弟候補のみ返す（途中の先の予測は出さない）
        function getKeybindCandidatesFiltered(query) {
            // why: 編集時はカーソルを挟む位置のキーを別キーに変えたときに存在するノードだけを候補にする
            // alt: 途中の先（予測パス・到達階層候補・現在パス候補）は表示しない
            // assumption: searchInput が参照可能であること
            let siblingCandidates = [];
            if (!isNavigationMode() && searchInput) {
                const pathString = (query || '').trim();
                const cursorPos = searchInput.selectionStart;
                const keyIndex = getKeyIndexFromCursor(pathString, cursorPos);
                const parentPath = pathString.slice(0, keyIndex);
                siblingCandidates = getLayerBindItems(parentPath).map(i => ({ ...i, isSiblingCandidate: true }));
            }

            const bindItems = getCurrentLayerBindItemsFiltered(query);
            return [...siblingCandidates, ...bindItems];
        }

        // 検索結果に応じて設定文字列・ナビ・マップをリアルタイム更新（ノードのみ）
        function applySearchResultToDisplay(result) {
            if (!result) return;
            if (result.type === 'node' && result.id !== undefined) navigateToPath(result.id);
        }

        if (searchInput && autocomplete) {
        searchInput.addEventListener('input', (e) => {
            // 貼り付け・IME確定時: 禁止文字を除去（許可文字のみ残す）
            const raw = e.target.value;
            const filtered = filterSearchInputValue(raw);
            if (filtered !== raw) {
                const oldStart = searchInput.selectionStart ?? 0;
                let newStart = 0;
                for (let i = 0; i < raw.length && i < oldStart; i++) {
                    if (isSearchCharAllowed(raw[i])) newStart++;
                }
                searchInput.value = filtered;
                const pos = Math.min(newStart, filtered.length);
                searchInput.setSelectionRange(pos, pos);
            }
            let query = e.target.value;
            const trimmed = query.trim();
            const justNavigated = (Date.now() - lastNavigateToPathAt) < 150;
            // 貼り付け・IME等: 無効な文字列は最長有効プレフィクスに差し替え（カーソルが末尾のときのみ。編集モードでは上書きしない）
            // validPrefix が空のときは上書きしない＝バックスペースで1文字消しただけの入力を空にしない
            // 階層移動直後は上書きしない＝一瞬の input で検索バーが消えるバグを防ぐ
            const cursorAtEnd = searchInput.selectionStart === searchInput.value.length;
            if (!justNavigated && cursorAtEnd && trimmed !== '' && trimmed !== '（最上位）') {
                const validPrefix = getLongestValidPath(trimmed);
                if (validPrefix !== trimmed && validPrefix !== '') {
                    if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                    e.target.value = validPrefix;
                    query = validPrefix;
                }
            }
            if (autocompleteTimeout) clearTimeout(autocompleteTimeout);
            // 空のときはナビモード扱い。予測パネルを出さない（バックスペースで空にしたときの一瞬表示を防ぐ）
            if (query.length === 0) {
                autocomplete.classList.remove('show');
            } else {
                // キーバインド候補のみ表示（入力文字列に対してキーバインドを予測）
                const items = getKeybindCandidatesFiltered(query);
                if (items.length === 0 && query.length > 0) {
                    console.log('候補が見つかりませんでした。クエリ:', query);
                }
                displayAutocomplete(items);
            }

            // 検索バー → 階層UI 同期: 編集モード（カーソルが末尾でない）のときは同期しない。階層移動直後は同期しない
            if (searchSyncTimeout) clearTimeout(searchSyncTimeout);
            if (!justNavigated) {
                searchSyncTimeout = setTimeout(() => {
                    if ((Date.now() - lastNavigateToPathAt) < 150) {
                        searchSyncTimeout = null;
                        return;
                    }
                    if (searchInput.selectionStart !== searchInput.value.length) {
                        searchSyncTimeout = null;
                        return;
                    }
                    const trimmed = searchInput.value.trim();
                    if (trimmed === '' || trimmed === '（最上位）') {
                        navigateToPath('');
                    } else {
                        const validPath = getLongestValidPath(trimmed);
                        if (validPath !== '') {
                            navigateToPath(validPath);
                        }
                        // validPath が空のときは検索欄を上書きしない（@^→26 など未マッチ入力が消えないようにする）
                    }
                    searchSyncTimeout = null;
                }, 0);
            }
            updateSearchMode();
        });

        searchInput.addEventListener('focus', () => {
            if (focusAutocompleteTimeout) clearTimeout(focusAutocompleteTimeout);
            // フォーカス時: ナビモード（カーソル先頭）なら予測パネルは出さない。編集モード時のみ遅延して候補表示
            focusAutocompleteTimeout = setTimeout(() => {
                if (isNavigationMode()) {
                    autocomplete.classList.remove('show');
                    focusAutocompleteTimeout = null;
                    return;
                }
                const query = searchInput.value;
                const items = query.length === 0
                    ? getEmptySearchAutocompleteItems()
                    : getKeybindCandidatesFiltered(query);
                displayAutocomplete(items);
                focusAutocompleteTimeout = null;
            }, 280);
            updateSearchMode();
        });

        searchInput.addEventListener('keyup', () => { updateSearchMode(); });
        searchInput.addEventListener('click', () => { updateSearchMode(); });

        searchInput.addEventListener('blur', () => {
            if (focusAutocompleteTimeout) {
                clearTimeout(focusAutocompleteTimeout);
                focusAutocompleteTimeout = null;
            }
            setTimeout(() => {
                autocomplete.classList.remove('show');
            }, 200);
        });

        // 補完候補を表示（ノード + 操作コマンドの統合リスト）
        function displayAutocomplete(results) {
            if (!autocomplete) {
                console.error('autocomplete要素が見つかりません');
                return;
            }
            
            autocomplete.innerHTML = '';
            // 編集モード用: 初期は未選択（Enterでそのまま確定させない。矢印 or クリックで候補を選んでから確定）
            selectedIndex = -1;
            lastAutocompleteResults = results || [];
            
            if (lastAutocompleteResults.length === 0) {
                autocomplete.classList.remove('show');
                return;
            }
            // 編集モード用パネル: タイトルを「この位置で有効なキー」に
            const titleEl = document.getElementById('autocomplete-panel-title');
            if (titleEl) titleEl.textContent = 'Keys available at this level';
            
            // デバッグ: 候補数をコンソールに出力
            console.log('候補を表示:', lastAutocompleteResults.length, '件');
            
            lastAutocompleteResults.forEach((entry, index) => {
                const item = document.createElement('div');
                let className = 'autocomplete-item';
                if (entry.type === 'command') {
                    className += ' command-item';
                }
                if (entry.predicted) {
                    className += ' predicted-item';
                }
                item.className = className;
                // 初期はどの候補も selected にしない（selectedIndex === -1）
                
                if (entry.type === 'command') {
                    item.textContent = entry.label;
                    item.addEventListener('click', () => {
                        if (typeof entry.action === 'function') entry.action();
                        // ナビ系コマンドの場合は updateDisplay() で検索バーが更新されるためクリアしない
                        autocomplete.classList.remove('show');
                    });
                } else {
                    const navLabel = (entry.navLabel && String(entry.navLabel).trim() !== '') ? entry.navLabel : '(Unassigned)';
                    // why: 兄弟候補は「この位置のキーを選んだキーに変える」意図を明示するため別ラベルにする
                    // alt: 通常ノードと同じ navLabel のみでもよいが、編集モードでの置換であることが分かるようにした
                    // evidence: 計画書「第4段階：displayAutocomplete のノード描画で isSiblingCandidate のとき」
                    // assumption: entry.keyChar は getLayerBindItems で付与されている
                    if (entry.isSiblingCandidate && entry.keyChar != null) {
                        item.textContent = `Use key ${entry.keyChar} → ${navLabel}`;
                    } else {
                        item.textContent = navLabel;
                    }
                    if (entry.predicted) {
                        // 予測パスを表示（例: "r → u"）
                        const predictedPath = entry.id.slice(currentPath.length);
                        const pathDisplay = predictedPath.split('').join(' → ');
                        const predictedSpan = document.createElement('span');
                        predictedSpan.className = 'predicted-label';
                        predictedSpan.textContent = `Predicted: ${pathDisplay}`;
                        item.appendChild(predictedSpan);
                    }
                    // 到達階層での候補の場合、どの階層での候補かを表示
                    if (entry.layerPath && entry.layerPath !== currentPath) {
                        const layerPathDisplay = entry.layerPath.slice(currentPath.length);
                        const layerSpan = document.createElement('span');
                        layerSpan.className = 'predicted-label';
                        layerSpan.style.color = '#ffa500'; // オレンジ色で区別
                        layerSpan.textContent = `Suggestion at ${layerPathDisplay || 'root'}`;
                        item.appendChild(layerSpan);
                    }
                    item.addEventListener('click', async () => {
                        // 存在チェック（ツリー構造を維持）
                        const targetNode = getNode(entry.id);
                        if (!targetNode) {
                            alert(`Path "${entry.id}" does not exist. Only configured nodes can be selected.`);
                            return;
                        }
                        // 予測変換確定時に追記されないよう、確定前に検索欄を選択値で置換する
                        if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                        searchInput.value = entry.id;
                        await navigateToPath(entry.id);
                        autocomplete.classList.remove('show');
                    });
                }
                autocomplete.appendChild(item);
            });
            
            autocomplete.classList.add('show');
        }

        // 補完の選択肢をキーで更新（index < 0 のときは未選択）
        function setAutocompleteSelected(index) {
            const items = autocomplete.querySelectorAll('.autocomplete-item');
            if (items.length === 0) return;
            if (index < 0) {
                selectedIndex = -1;
                items.forEach((el) => el.classList.remove('selected'));
                return;
            }
            selectedIndex = ((index % items.length) + items.length) % items.length;
            items.forEach((el, i) => el.classList.toggle('selected', i === selectedIndex));
        }

        // ナビモード = カーソルが末尾（例: 1111| → Nav、それ以外は Edit）
        // 値がカンマで終わっている場合はナビにしない＝「1,」のあと「1」で「1,1」と入力できるようにする
        function isNavigationMode() {
            const v = searchInput.value;
            const len = v.length;
            if (len > 0 && v.endsWith(',')) return false;
            return searchInput.selectionStart === len && searchInput.selectionEnd === len;
        }

        // モードの視覚表示を更新（data-mode とバッジ、パネル内容の切り替え）
        function updateSearchMode() {
            const len = searchInput.value.length;
            const mode = (searchInput.selectionStart === len && searchInput.selectionEnd === len) ? 'nav' : 'edit';
            const bar = document.querySelector('.search-bar');
            const badge = document.getElementById('searchModeBadge');
            const panel = document.getElementById('autocompletePanel');
            if (bar) bar.setAttribute('data-mode', mode);
            if (badge) {
                badge.setAttribute('data-mode', mode);
                badge.textContent = mode === 'nav' ? 'Nav' : 'Edit';
            }
            if (panel) panel.setAttribute('data-mode', mode);
            const panelTitle = document.getElementById('autocomplete-panel-title');
            if (mode === 'nav' && typeof updateContentDisplay === 'function') {
                updateContentDisplay();
            } else if (panelTitle) {
                panelTitle.textContent = 'Keys available at this level';
            }
        }

        updateSearchMode();

        // 検索欄でのキーバインド（オートコンプリート操作）— ここで処理したキーは伝播させない
        searchInput.addEventListener('keydown', async (e) => {
            // IME変換中（日本語・中国語等）は keydown でブロックしない。確定後の文字は input イベントでフィルタする
            if (e.isComposing) return;

            // 検索欄入力制限: スペースは常にブロック。1文字キーで修飾キーなしのとき、禁止文字はブロック。CAPS LOCK オンかつ Shift+数字/英字キー(e.code)のときのみフォールバックで挿入。
            if (e.key === ' ') {
                e.preventDefault();
                return;
            }
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const fallbackChar = getSearchFallbackFromCode(e.code, e.shiftKey);
                const capsLockOn = e.getModifierState('CapsLock');
                if (capsLockOn && e.shiftKey && fallbackChar !== null) {
                    e.preventDefault();
                    insertAtCursor(searchInput, fallbackChar);
                    return;
                }
                // 禁止文字（^ @ やその他記号・大文字）: ブロックのみ（挿入しない）
                if (!isSearchCharAllowed(e.key)) {
                    e.preventDefault();
                }
            }

            const navMode = isNavigationMode();

            // ナビモード時は予測パネルを非表示にする（ただし上下矢印のときは候補内移動のため非表示にしない）
            if (navMode && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
                autocomplete.classList.remove('show');
            }

            // 検索欄が空のとき Backspace: 一つ上の階層へ戻る
            if (e.key === 'Backspace' && searchInput.value.length === 0) {
                e.preventDefault();
                e.stopPropagation();
                if (currentPath.length > 0) {
                    navigateToPath(currentPath.slice(0, -1));
                }
                return;
            }

            // ナビモード時 Backspace（検索欄に文字あり）: 末尾1文字削除し、検索バーに合わせて仮想キーボード状態を同期
            if (e.key === 'Backspace' && navMode && searchInput.value.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                const newValue = searchInput.value.slice(0, -1);
                searchInput.value = newValue;
                if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                navigateToPath(getLongestValidPath(newValue));
                return;
            }

            // 検索欄で Ctrl+Alt+英数字: そのキーの設定ダイアログを開く
            const searchMapKey = getMapKeyFromEvent(e);
            if (e.ctrlKey && e.altKey && searchMapKey) {
                e.preventDefault();
                e.stopPropagation();
                openBindDialog(searchMapKey);
                return;
            }
            // ナビモード時のみ: 英数字1キーで階層移動。編集モード時はそのまま入力させる
            if (navMode && !e.ctrlKey && !e.altKey && !e.metaKey && searchMapKey) {
                e.preventDefault();
                e.stopPropagation();
                handleKeyPress(searchMapKey);
                return;
            }

            // 上下矢印: 編集モードで候補が未表示のときは候補を出してから選択移動できるようにする（行端へ飛ばない）
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !navMode) {
                if (!autocomplete.classList.contains('show') || lastAutocompleteResults.length === 0) {
                    const query = searchInput.value;
                    const items = getKeybindCandidatesFiltered(query);
                    if (items && items.length > 0) {
                        displayAutocomplete(items);
                        const idx = e.key === 'ArrowDown' ? 0 : items.length - 1;
                        setAutocompleteSelected(idx);
                    }
                    if (!e.isComposing) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    return;
                }
            }

            if (!autocomplete.classList.contains('show') || lastAutocompleteResults.length === 0) return;
            const items = autocomplete.querySelectorAll('.autocomplete-item');
            if (items.length === 0) return;

            // Tab=次候補 / Shift+Tab=前候補（矢印と同様に候補移動）
            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
            }
            if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
                if (!e.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                const newIndex = selectedIndex < 0 ? 0 : selectedIndex + 1;
                setAutocompleteSelected(newIndex);
                const sel = lastAutocompleteResults[newIndex];
                if (sel && sel.type === 'node') {
                    // 存在するノードの場合のみ検索バーに反映（フルパスで上書き＝編集モードで相対パスが貼られないようにする）
                    const targetNode = getNode(sel.id);
                    if (targetNode) {
                        if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                        searchInput.value = sel.id;
                        const items = getKeybindCandidatesFiltered(searchInput.value);
                        displayAutocomplete(items);
                        const newSelectedIndex = items.findIndex(item => item.type === 'node' && item.id === sel.id);
                        if (newSelectedIndex >= 0) {
                            setAutocompleteSelected(newSelectedIndex);
                        }
                        applySearchResultToDisplay(sel);
                    }
                }
                return;
            }
            if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
                if (!e.isComposing) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                const newIndex = selectedIndex < 0 ? (items.length - 1) : selectedIndex - 1;
                setAutocompleteSelected(newIndex);
                const sel = lastAutocompleteResults[newIndex];
                if (sel && sel.type === 'node') {
                    // 存在するノードの場合のみ検索バーに反映（フルパスで上書き＝編集モードで相対パスが貼られないようにする）
                    const targetNode = getNode(sel.id);
                    if (targetNode) {
                        if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                        searchInput.value = sel.id;
                        const items = getKeybindCandidatesFiltered(searchInput.value);
                        displayAutocomplete(items);
                        const newSelectedIndex = items.findIndex(item => item.type === 'node' && item.id === sel.id);
                        if (newSelectedIndex >= 0) {
                            setAutocompleteSelected(newSelectedIndex);
                        }
                        applySearchResultToDisplay(sel);
                    }
                }
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // 編集モード: 候補を選択していない状態では確定しない（予測のどれかを選んでからEnter）
                if (selectedIndex < 0) return;
                const sel = lastAutocompleteResults[selectedIndex];
                if (sel) {
                    if (sel.type === 'command') {
                        if (typeof sel.action === 'function') sel.action();
                        searchInput.value = '';
                        autocomplete.classList.remove('show');
                        return;
                    }
                    // ノードの場合、存在チェックを行い、存在する場合のみ移動（ツリー構造を維持）
                    if (sel.type === 'node') {
                        const targetNode = getNode(sel.id);
                        if (!targetNode) {
                            // ノードが存在しない場合はエラー表示
                            alert(`Path "${sel.id}" does not exist. Only configured nodes can be selected.`);
                            return;
                        }
                        const textToPaste = (sel.navLabel && String(sel.navLabel).trim() !== '') ? sel.navLabel : '';
                        // ナビモード時のみ Enter で貼り付け。編集モードでは Enter は予測の決定のみ（貼り付けしない）
                        if (navMode && pasteTargetKey) {
                            const targetPath = currentPath + pasteTargetKey;
                            const existing = getNode(targetPath);
                            (async () => {
                                try {
                                    await apiCall(`/nodes/${encodeURIComponent(targetPath)}`, {
                                        method: 'POST',
                                        body: JSON.stringify({ navLabel: textToPaste, content: existing?.content || '' })
                                    });
                                    await loadTree();
                                    pasteTargetKey = null;
                                } catch (err) {
                                    console.error('貼り付けエラー:', err);
                                    alert('Paste failed.');
                                }
                            })();
                            searchInput.value = '';
                            autocomplete.classList.remove('show');
                        } else {
                            // 予測変換確定時に追記されないよう、確定前に検索欄を選択値で置換する
                            if (searchSyncTimeout) { clearTimeout(searchSyncTimeout); searchSyncTimeout = null; }
                            searchInput.value = sel.id;
                            await navigateToPath(sel.id);
                            autocomplete.classList.remove('show');
                        }
                    }
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                autocomplete.classList.remove('show');
            }
        });
        }

        // ダイアログ・内容欄: Ctrl+Enter で保存（伝播させず競合防止）
        const bindContentInputEl = document.getElementById('bindContentInput');
        if (bindContentInputEl) {
            bindContentInputEl.addEventListener('keydown', (e) => {
                // IME変換中（日本語・中国語等）は keydown でブロックしない。確定後の文字は input イベントでフィルタする
                if (e.isComposing) return;
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveBind();
                }
                if ((e.ctrlKey && e.shiftKey && e.key === 'N') || (e.ctrlKey && e.shiftKey && e.key === 'C')) {
                    e.stopPropagation();
                }
            });
        }

        // ダイアログ・ラベル欄: Ctrl+Enter で保存（伝播させず競合防止）
        const bindNavLabelInputEl = document.getElementById('bindNavLabelInput');
        if (bindNavLabelInputEl) {
            bindNavLabelInputEl.addEventListener('keydown', (e) => {
                if (e.isComposing) return;
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    saveBind();
                }
                if ((e.ctrlKey && e.shiftKey && e.key === 'N') || (e.ctrlKey && e.shiftKey && e.key === 'C')) {
                    e.stopPropagation();
                }
            });
        }

        // 入力欄・テキストエリアかどうか
        function isFormFocused() {
            const el = document.activeElement;
            return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
        }

        // 英数字1文字か（マップ用。操作キーバインドには使わない）
        // ASCII文字の英字（大文字小文字区別なし）+ 数字のみ
        function isMapKey(key) {
            if (key.length !== 1) return false;
            const code = key.toUpperCase().charCodeAt(0);
            // 48-57: 数字 (0-9), 65-90: 英字 (A-Z)
            return (code >= 48 && code <= 57) || (code >= 65 && code <= 90);
        }

        // キーイベントからマップキー文字を取得（現在レイアウトの codeToCharMap 優先、なければ従来フォールバック）
        function getMapKeyFromEvent(e) {
            const layout = KEYBOARD_LAYOUTS.find(l => l.id === inputMode);
            if (layout && layout.codeToCharMap && e.code && layout.codeToCharMap[e.code] != null) {
                const ch = layout.codeToCharMap[e.code];
                return (typeof ch === 'string' && ch.length === 1) ? ch.toLowerCase() : null;
            }
            // 従来フォールバック
            if (inputMode === 'tenkey') {
                if (e.key >= '0' && e.key <= '9') return e.key;
                if (e.key && e.key.startsWith('Numpad') && e.key.length === 7) {
                    const n = e.key.replace('Numpad', '');
                    if (n >= '0' && n <= '9') return n;
                }
                return null;
            }
            if (isMapKey(e.key)) return e.key.toLowerCase();
            return null;
        }

        // スクロール可能要素で矢印・PageUp/PageDown を処理（キーバインドではなく標準のスクロール操作）
        function handleScrollKey(el, e) {
            if (!el) return false;
            const key = e.key;
            const line = 48;
            const page = Math.max(100, (el.clientHeight || 400) - 40);
            if (key === 'ArrowDown') {
                el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + line);
                return true;
            }
            if (key === 'ArrowUp') {
                el.scrollTop = Math.max(0, el.scrollTop - line);
                return true;
            }
            if (key === 'PageDown') {
                el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + page);
                return true;
            }
            if (key === 'PageUp') {
                el.scrollTop = Math.max(0, el.scrollTop - page);
                return true;
            }
            return false;
        }

        // 全操作をキーバインドで（英数字以外: Ctrl/Alt/Backspace/Fキー等）
        document.addEventListener('keydown', async (e) => {
            const bindDialogEl = document.getElementById('bindDialog');
            const dialogOpen = bindDialogEl ? bindDialogEl.classList.contains('show') : false;

            // Ctrl+Shift+Space toggles the launcher workspace. This is the
            // keyboard equivalent of clicking the marker/open button.
            if (e.ctrlKey && e.shiftKey && e.code === 'Space' && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (document.body.classList.contains('marker-collapsed')) expandMineparser();
                return;
            }

            // F1〜F6 ショートカット（ヘルプ/エクスポート/インポート/テンキー/言語/モード）
            if (e.key === 'F1') {
                e.preventDefault();
                openHelpModal();
                return;
            }
            if (e.key === 'F2') {
                e.preventDefault();
                doExport();
                return;
            }
            if (e.key === 'F3') {
                e.preventDefault();
                doImport();
                return;
            }
            if (e.key === 'F4') {
                e.preventDefault();
                openTenkeySettingsModal();
                return;
            }
            if (e.key === 'F5') {
                e.preventDefault();
                openSettingModal();
                return;
            }
            if (e.key === 'F6') {
                e.preventDefault();
                openModeModal();
                return;
            }

            // Escape: ヘルプモーダル／テンキー設定モーダル／設定モーダル／モードモーダル／設定ダイアログを閉じる
            if (e.key === 'Escape') {
                const tenkeyOverlay = document.getElementById('tenkeyModalOverlay');
                const settingOverlay = document.getElementById('settingModalOverlay');
                const modeOverlay = document.getElementById('modeModalOverlay');
                const helpOverlay = document.getElementById('helpModalOverlay');
                const tenkeyOpen = tenkeyOverlay ? tenkeyOverlay.classList.contains('show') : false;
                const settingOpen = settingOverlay ? settingOverlay.classList.contains('show') : false;
                const modeOpen = modeOverlay ? modeOverlay.classList.contains('show') : false;
                const helpOpen = helpOverlay ? helpOverlay.classList.contains('show') : false;
                if (tenkeyOpen) {
                    closeTenkeySettingsModal();
                    e.preventDefault();
                } else if (settingOpen) {
                    closeSettingModal();
                    e.preventDefault();
                } else if (modeOpen) {
                    closeModeModal();
                    e.preventDefault();
                } else if (helpOpen) {
                    closeHelpModal();
                    e.preventDefault();
                } else if (dialogOpen) {
                    closeBindDialog();
                    e.preventDefault();
                } else if (!window.__TAURI__) {
                    // In the web app Escape collapses the workspace back to its launcher state.
                    collapseMineparser();
                    e.preventDefault();
                }
                return;
            }

            // モーダル表示中: 矢印・PageUp/PageDown でスクロール（キーバインドではなく標準のスクロール操作）
            const helpOverlayScroll = document.getElementById('helpModalOverlay');
            const helpOpenScroll = helpOverlayScroll ? helpOverlayScroll.classList.contains('show') : false;
            if (helpOpenScroll && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown')) {
                const helpModalEl = document.getElementById('helpModal');
                if (helpModalEl && handleScrollKey(helpModalEl, e)) {
                    if (!e.isComposing) e.preventDefault();
                    return;
                }
            }
            const settingOverlayScroll = document.getElementById('settingModalOverlay');
            const settingOpenScroll = settingOverlayScroll ? settingOverlayScroll.classList.contains('show') : false;
            if (settingOpenScroll && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown')) {
                const settingModalEl = document.getElementById('settingModal');
                if (settingModalEl && handleScrollKey(settingModalEl, e)) {
                    if (!e.isComposing) e.preventDefault();
                    return;
                }
            }
            const modeOverlayScroll = document.getElementById('modeModalOverlay');
            const modeOpenScroll = modeOverlayScroll ? modeOverlayScroll.classList.contains('show') : false;
            if (modeOpenScroll && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown')) {
                const modeModalEl = document.getElementById('modeModal');
                if (modeModalEl && handleScrollKey(modeModalEl, e)) {
                    if (!e.isComposing) e.preventDefault();
                    return;
                }
            }

            // キーボード設定モーダル表示中: 左右矢印でレジストリ切り替え、上下・PageUp/PageDownでスクロール、Enterで閉じる
            const tenkeyOverlayCheck = document.getElementById('tenkeyModalOverlay');
            const tenkeyOpen = tenkeyOverlayCheck ? tenkeyOverlayCheck.classList.contains('show') : false;
            if (tenkeyOpen) {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') {
                    const tenkeyModalEl = document.getElementById('tenkeyModal');
                    if (tenkeyModalEl && handleScrollKey(tenkeyModalEl, e)) {
                        if (!e.isComposing) e.preventDefault();
                        return;
                    }
                }
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const layoutIndex = KEYBOARD_LAYOUTS.findIndex(l => l.id === inputMode);
                    const newIndex = layoutIndex <= 0 ? KEYBOARD_LAYOUTS.length - 1 : layoutIndex - 1;
                    setInputMode(KEYBOARD_LAYOUTS[newIndex].id);
                    return;
                }
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const layoutIndex = KEYBOARD_LAYOUTS.findIndex(l => l.id === inputMode);
                    const newIndex = layoutIndex < 0 || layoutIndex >= KEYBOARD_LAYOUTS.length - 1 ? 0 : layoutIndex + 1;
                    setInputMode(KEYBOARD_LAYOUTS[newIndex].id);
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closeTenkeySettingsModal();
                    return;
                }
            }

            // ダイアログ表示中: Ctrl+S のみここで保存（それ以外は入力欄の入力に任せる）
            if (dialogOpen) {
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    saveBind();
                    return;
                }
                // ダイアログ内の入力欄にフォーカスがある場合は、そのまま入力可能にする（return しない）
                const active = document.activeElement;
                if (active && (active.id === 'bindNavLabelInput' || active.id === 'bindContentInput')) {
                    return;
                }
            }

            // 入力欄にフォーカスがあるときは、操作キーのみ処理（マップキーは入力に任せる）
            if (isFormFocused()) {
                if (e.ctrlKey && e.key === 'k') {
                    e.preventDefault();
                    const si = document.getElementById('searchInput');
                    if (si) si.focus();
                }
                // 検索バーにフォーカス時のみ: Ctrl+Enter で現在の階層の追加編集（ダイアログを開く）
                const searchInput = document.getElementById('searchInput');
                if (searchInput && document.activeElement === searchInput && e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    const current = getNode(currentPath);
                    const keyNameEl = document.getElementById('bindKeyName');
                    const currentPathEl = document.getElementById('bindCurrentPath');
                    const navLabelInputEl = document.getElementById('bindNavLabelInput');
                    const contentInputEl = document.getElementById('bindContentInput');
                    const dialogEl = document.getElementById('bindDialog');
                    if (keyNameEl) keyNameEl.textContent = '[Current item]';
                    if (currentPathEl) currentPathEl.textContent = currentPath || '';
                    if (navLabelInputEl) navLabelInputEl.value = current.navLabel || '';
                    if (contentInputEl) contentInputEl.value = current.content || '';
                    if (dialogEl) {
                        dialogEl.setAttribute('data-target-path', currentPath);
                        dialogEl.classList.add('show');
                    }
                    if (contentInputEl) contentInputEl.focus();
                    return;
                }
                // Ctrl+Cは入力欄内でのコピーを優先
                return;
            }

            // Ctrl+C: 現在の設定文字列をクリップボードにコピー（フォームにフォーカスがない場合）
            if (e.ctrlKey && e.key === 'c' && !e.shiftKey && !e.altKey) {
                const contentEl = document.getElementById('panelContentNav');
                if (!contentEl) return;
                const content = contentEl.getAttribute('data-content');
                if (content) {
                    e.preventDefault();
                    const success = await copyAndPasteToPreviousWindow(content);
                    showCopyFeedback(contentEl, success);
                }
                return;
            }

            // ----- 以下はフォーカスがフォーム外のとき -----

            // Ctrl+Alt+英数字: そのキーの設定ダイアログを開く
            const docMapKey = getMapKeyFromEvent(e);
            if (e.ctrlKey && e.altKey && docMapKey) {
                e.preventDefault();
                openBindDialog(docMapKey);
                return;
            }

            // Alt+英数字: 貼り付け先キーを選択（同じキーで解除）
            if (e.altKey && !e.ctrlKey && docMapKey) {
                e.preventDefault();
                pasteTargetKey = pasteTargetKey === docMapKey ? null : docMapKey;
                updateKeyboardLayout();
                return;
            }

            // Ctrl+K: 検索にフォーカス
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                const si = document.getElementById('searchInput');
                if (si) si.focus();
                return;
            }

            // Backspace または Alt+Left: 一つ上の階層へ戻る（検索欄にフォーカスがあるときは除外＝1文字だけ削除させる）
            if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
                if (searchInput && document.activeElement === searchInput) return;
                e.preventDefault();
                if (currentPath.length > 0) {
                    navigateToPath(currentPath.slice(0, -1));
                }
                return;
            }

            // Ctrl+Shift+N: 現在の階層のナビラベルのみ編集（ダイアログを開く）
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault();
                const current = getNode(currentPath);
                const keyNameEl = document.getElementById('bindKeyName');
                const currentPathEl = document.getElementById('bindCurrentPath');
                const navLabelInputEl = document.getElementById('bindNavLabelInput');
                const contentInputEl = document.getElementById('bindContentInput');
                const dialogEl = document.getElementById('bindDialog');
                if (keyNameEl) keyNameEl.textContent = '[Current item]';
                if (currentPathEl) currentPathEl.textContent = currentPath || '';
                if (navLabelInputEl) navLabelInputEl.value = current.navLabel || '';
                if (contentInputEl) contentInputEl.value = current.content || '';
                if (dialogEl) {
                    dialogEl.setAttribute('data-target-path', currentPath);
                    dialogEl.classList.add('show');
                }
                if (navLabelInputEl) { navLabelInputEl.focus(); navLabelInputEl.select(); }
                return;
            }

            // Ctrl+Shift+C: 現在の階層の設定文字列のみ編集（ダイアログを開く）
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                const current = getNode(currentPath);
                const keyNameEl = document.getElementById('bindKeyName');
                const currentPathEl = document.getElementById('bindCurrentPath');
                const navLabelInputEl = document.getElementById('bindNavLabelInput');
                const contentInputEl = document.getElementById('bindContentInput');
                const dialogEl = document.getElementById('bindDialog');
                if (keyNameEl) keyNameEl.textContent = '[Current item]';
                if (currentPathEl) currentPathEl.textContent = currentPath || '';
                if (navLabelInputEl) navLabelInputEl.value = current.navLabel || '';
                if (contentInputEl) contentInputEl.value = current.content || '';
                if (dialogEl) {
                    dialogEl.setAttribute('data-target-path', currentPath);
                    dialogEl.classList.add('show');
                }
                if (contentInputEl) { contentInputEl.focus(); contentInputEl.select(); }
                return;
            }

            // Ctrl+Enter: 現在の階層のラベル・内容を編集（ダイアログを開く）
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const current = getNode(currentPath);
                const keyNameEl = document.getElementById('bindKeyName');
                const currentPathEl = document.getElementById('bindCurrentPath');
                const navLabelInputEl = document.getElementById('bindNavLabelInput');
                const contentInputEl = document.getElementById('bindContentInput');
                const dialogEl = document.getElementById('bindDialog');
                if (keyNameEl) keyNameEl.textContent = '[Current item]';
                if (currentPathEl) currentPathEl.textContent = currentPath || '';
                if (navLabelInputEl) navLabelInputEl.value = current.navLabel || '';
                if (contentInputEl) contentInputEl.value = current.content || '';
                if (dialogEl) {
                    dialogEl.setAttribute('data-target-path', currentPath);
                    dialogEl.classList.add('show');
                }
                if (contentInputEl) contentInputEl.focus();
                return;
            }

            // 英数字のみ: マップナビゲーション（クリックと同じ）
            const navMapKey = getMapKeyFromEvent(e);
            if (!e.ctrlKey && !e.altKey && !e.metaKey && navMapKey) {
                e.preventDefault();
                handleKeyPress(navMapKey);
            }
        });

        // 設定文字列のクリック: クリップボードにコピー（パネル内 panelContentNav）
        const panelContentNavEl = document.getElementById('panelContentNav');
        if (panelContentNavEl) {
            panelContentNavEl.addEventListener('click', async (e) => {
                const contentEl = e.currentTarget;
                const content = contentEl.getAttribute('data-content');
                if (content) {
                    const success = await copyAndPasteToPreviousWindow(content);
                    showCopyFeedback(contentEl, success);
                }
            });

            panelContentNavEl.addEventListener('keydown', async (e) => {
                const contentEl = e.currentTarget;
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') {
                    if (handleScrollKey(contentEl, e)) { if (!e.isComposing) e.preventDefault(); }
                    return;
                }
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const content = contentEl.getAttribute('data-content');
                if (!content) return;
                e.preventDefault();
                const success = await copyAndPasteToPreviousWindow(content);
                showCopyFeedback(contentEl, success);
            });

            panelContentNavEl.addEventListener('dblclick', () => { openBindDialogForCurrentPath(); });
        }

        // 初期化（DOMContentLoadedイベントで実行）
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                loadTree();
            });
        } else {
            // DOMが既に読み込まれている場合は即座に実行
            loadTree();
        }
