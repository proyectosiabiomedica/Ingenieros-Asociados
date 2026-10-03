/* Ingenieros Asociados · Gestión de Mantenimiento · app.js
   Lógica de la plataforma (v5.6: separada de index.html para que el
   service worker la guarde aparte). */
        Chart.register(ChartDataLabels);

        /* ============================================================
           CONFIGURACIÓN GENERAL
           ============================================================ */

        // Formato de fecha del CSV publicado por Google Sheets.
        // 'DMY' = día/mes/año (hoja en español)  |  'MDY' = mes/día/año (hoja en inglés/US).
        // Solo se usa cuando la fecha es ambigua (ambas partes <= 12).
        const FORMATO_FECHA = 'DMY';

        // Excluir del dashboard las órdenes marcadas como prueba
        // (detecta la frase "orden de prueba" en observaciones/detalle).
        const EXCLUIR_ORDENES_PRUEBA = true;

        /* ------------------------------------------------------------------
           v2.8 — COLUMNA "INDICADOR DE PRUEBA" (hoja "Form responses")
           Si el registro trae una "X" en esa columna, la orden NO se considera
           en NINGUNA parte del sistema: ni KPIs del dashboard, ni gráficas, ni
           tablas de preventivos/correctivos, ni oportunidades de venta, ni
           barra lateral de clientes, ni generador de rutinas. El descarte se
           hace al leer la hoja, antes de procesar la fila.

           COLUMNA_EXCLUSION: nombre del encabezado tal como está en la hoja.
             Si se deja vacío se intenta autodetectar con la lista de
             candidatos, pero lo recomendable es declararlo explícitamente.
           MARCAS_EXCLUSION: valores que cuentan como marcado (sin acentos ni
             mayúsculas). La celda vacía nunca excluye.

           NOTA sobre v2.8.1: la lista de candidatos ya no incluye 'marca'
           porque coincidía con la columna "MARCA:" del equipo, y 'no' salió de
           MARCAS_EXCLUSION porque una celda con "no" (respuesta legítima)
           habría borrado la orden. Ahora solo marcan valores afirmativos.
           ------------------------------------------------------------------ */
        const COLUMNA_EXCLUSION = 'Indicador de Prueba';
        const CANDIDATOS_COLUMNA_EXCLUSION = [
            'indicador de prueba', 'indicador prueba', 'orden de prueba',
            'excluir', 'no considerar', 'omitir', 'descartar', 'ignorar',
            'anulada', 'anulado', 'cancelada', 'cancelado'
        ];
        const MARCAS_EXCLUSION = ['x', 'xx', 'si', 'sí', 'true', 'verdadero', '1',
                                  'prueba', 'excluir', 'omitir'];

        // Frecuencia de mantenimiento (en meses) según el tipo de equipo.
        // Se busca la palabra clave dentro del nombre del equipo; si ninguna
        // coincide se usa FRECUENCIA_DEFAULT. Ajusta según tus contratos.
        const FRECUENCIA_DEFAULT = 6;
        const FRECUENCIAS_MESES = [
            // { clave: 'cama',    meses: 12 },
            // { clave: 'camilla', meses: 12 },
            // { clave: 'mesa',    meses: 12 }
            // Ejemplos para agregar:
            // { clave: 'ventilador', meses: 4 },
            // { clave: 'anestesia',  meses: 6 },
        ];

        const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

        /* ============================================================
           v2.6 — SEGURIDAD, BITÁCORA Y SINCRONIZACIÓN
           Requiere desplegar Code.gs como Web App de Google Apps Script
           (Ejecutar como: yo · Acceso: cualquier usuario) y pegar aquí
           la URL /exec y el mismo token definido en Code.gs.
           ============================================================ */
        const VERSION_APP = '5.6';

        // URL del Web App de Apps Script (termina en /exec). Vacío = sin backend.
        const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbzfExL7dS7DRXBk_CbmZ3B4xr-NWEoitYmhPDbU18STN8Mlm_FrRpVwcvLiM_ctp52_ug/exec';

        /* v5.3: ya no hay token fijo. Al entrar con PIN, el servidor entrega una
           sesión firmada que se manda en cada petición (tokenSesion()). Nada de
           lo que está escrito en este archivo —que es público— abre los datos. */

        // Origen de los datos de las hojas:
        //  'csv'        → CSV publicados (comportamiento original)
        //  'appsscript' → vía Code.gs con token (permite DESPUBLICAR los CSV,
        //                 con lo que la hoja deja de ser pública)
        const ORIGEN_DATOS = 'appsscript';

        // Control de acceso a la página:
        //  - Se activa cuando hay PIN definido o hay backend configurado.
        //  - pin: ''  → solo pide nombre (identificación) y lo registra.
        //  - pin: '1234' → además exige el PIN; los intentos fallidos
        //    también quedan en la bitácora.
        /* v3.1 — CONTROL DE ACCESO CON USUARIOS Y ADMINISTRADOR
           · Con backend configurado, los usuarios y sus PIN viven en la hoja
             "Usuarios" y TODA la validación ocurre en Apps Script. El PIN se
             guarda como huella SHA-256 con sal, no en claro, y el código
             maestro del administrador solo existe en Code.gs.
           · Sin backend, la aplicación cae a un modo local: los usuarios se
             guardan en este navegador. Sirve para probar o para un equipo
             suelto, pero NO es un control de acceso real: cualquiera con la
             consola del navegador puede sortearlo. Para uso formal, configura
             URL_APPS_SCRIPT.
           · 'pin' es el PIN compartido heredado de la v2.6. Se conserva para
             no dejar fuera a quien ya lo usaba; si hay usuarios dados de alta,
             ellos mandan. */
        const CONTROL_ACCESO = {
            habilitado: true,
            pin: '',                                // v5.3: sin PIN compartido
            codigoAdminLocal: 'ADMIN-LOCAL-2026',   // solo aplica en modo sin backend
            nombreAdmin: 'Administrador',           // nombre con el que se registra el ingreso maestro
            diasSesion: 30
        };

        // Catálogos de la pestaña Comunicación y Seguimiento
        const ESTATUS_SEGUIMIENTO = ['Abierto', 'En proceso', 'Esperando refacción', 'Esperando al cliente', 'Cotización enviada', 'Concluido'];
        const CLASES_ESTATUS = {
            'Abierto':              'bg-amber-100 text-amber-700',
            'En proceso':           'bg-blue-100 text-blue-700',
            'Esperando refacción':  'bg-purple-100 text-purple-700',
            'Esperando al cliente': 'bg-slate-200 text-slate-700',
            'Cotización enviada':   'bg-brand-100 text-brand-700',
            'Concluido':            'bg-green-100 text-green-700'
        };
        const CLASES_PRIORIDAD = { 'Alta': 'bg-red-100 text-red-700', 'Media': 'bg-amber-100 text-amber-700', 'Baja': 'bg-slate-100 text-slate-600' };

        /* ============================================================
           UTILIDADES
           ============================================================ */

        // FIX: normalizador de acentos reutilizable
        const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        // FIX: escape de HTML para prevenir inyección/roturas por comillas y < >
        const esc = (s) => String(s ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // FIX: expandir notación científica en series/inventarios (ej. "9.09033102E8" -> "909033102")
        const normalizarSerie = (v) => {
            const s = String(v ?? '').trim();
            if (/^-?\d+(\.\d+)?[eE]\+?\d+$/.test(s)) {
                const n = Number(s);
                if (Number.isFinite(n)) return n.toLocaleString('fullwide', { useGrouping: false });
            }
            // Quitar ".0" final que agrega Sheets a números (ej. "1007.0")
            return s.replace(/\.0+$/, '');
        };

        let charts = { carga: null, tipos: null, clientes: null, marcas: null };
        // v2.8: una gráfica por parámetro → arreglo de instancias de Chart.js
        let chartsRutina = [];

        // Estado de edición de la Sección V (Valores de Medición) de la rutina
        let rutinaFilasActuales = null;      // formato estructurado (editable)
        let rutinaFilasOriginales = null;    // copia original para detectar cambios
        let rutinaLecturasActuales = null;   // fallback de lecturas sueltas (editable)
        let rutinaLecturasOriginales = null; // copia original para detectar cambios

        let datosAgrupadosPorMes = [];
        let datosDetalleOrdenes = [];
        let clientesUnicos = [];
        let clienteActual = '';
        let dataPreventivos = [];
        let dataCorrectivos = [];
        // v3.7: cada pestaña de servicio tiene su propio conjunto
        let dataCalibraciones = [];
        let dataEntregas = [];

        // v2.8: paleta de gráficas derivada del logotipo institucional
        const COLOR_INSTITUCIONAL       = '#005DA1';
        const COLOR_INSTITUCIONAL_CLARO = '#ABE1F5';
        const palette = ['#005DA1', '#3E9FD1', '#ABE1F5', '#004E88', '#f59e0b', '#64748b', '#8b5cf6'];

        /* v5.3: los datos solo salen por Apps Script con sesión. Las direcciones
           de los CSV publicados se quitaron del código: si la hoja siguiera
           publicada, cualquiera las leería sin PIN. Despublica la hoja en
           Archivo → Compartir → Publicar en la web → Detener la publicación. */
        const csvUrlDashboard = '';
        const csvUrlCorpus = '';

        /* v2.9: catálogo "datos equipo de calibracion" (equipos patrón).
           Con ORIGEN_DATOS = 'appsscript' NO hace falta llenar esta URL: el
           backend sirve la pestaña con &hoja=patrones. Solo se usa cuando se
           trabaja con CSV publicados; en ese caso, publica esa pestaña y pega
           aquí su URL (cambia el gid). Si queda vacía, el generador de rutinas
           sigue funcionando pero sin datos de certificado ni vigencia. */
        const csvUrlPatrones = '';

        /* v3.8: tarifario de mantenimiento (pestaña Precios_Mantenimiento).
           Igual que el catálogo de patrones: con ORIGEN_DATOS='appsscript' no
           hace falta llenarla, el backend la sirve con &hoja=precios. */
        const csvUrlPrecios = '';

        // v2.6: origen de datos configurable (CSV publicado o proxy de Apps Script)
        // v2.7: 'fresco' fuerza al backend a saltarse su propia caché
        function urlDatos(hoja, fresco) {
            if (ORIGEN_DATOS === 'appsscript' && hayBackend()) {
                return URL_APPS_SCRIPT + '?accion=datos&hoja=' + hoja +
                       '&token=' + encodeURIComponent(tokenSesion()) +
                       (fresco ? '&fresco=1' : '') + '&t=' + Date.now();
            }
            if (hoja === 'patrones') {
                if (!csvUrlPatrones) throw new Error('Sin URL publicada para el catálogo de equipos de calibración');
                return csvUrlPatrones + '&t=' + Date.now();
            }
            if (hoja === 'precios') {
                if (!csvUrlPrecios) throw new Error('Sin URL publicada para el tarifario de mantenimiento');
                return csvUrlPrecios + '&t=' + Date.now();
            }
            if (hoja === 'config_cot' || hoja === 'catalogo_cot') {
                throw new Error('El cotizador requiere el backend de Apps Script configurado');
            }
            const pub = hoja === 'dashboard' ? csvUrlDashboard : csvUrlCorpus;
            if (!pub) throw new Error('Los datos requieren el backend de Apps Script configurado.');
            return pub + '&t=' + Date.now();
        }

        /* ============================================================
           v2.7 — CACHÉ DE SESIÓN
           El parámetro &t=Date.now() anula el caché HTTP, así que cada
           navegación volvía a descargar las hojas completas. Aquí se guardan
           unos minutos en sessionStorage; el botón Actualizar siempre las
           vuelve a pedir.
           ============================================================ */
        const TTL_CACHE_MS = 5 * 60 * 1000;

        function csvDeCache(hoja) {
            try {
                const c = JSON.parse(sessionStorage.getItem('ia_csv_' + hoja) || 'null');
                return (c && Date.now() - c.ts < TTL_CACHE_MS) ? c.texto : null;
            } catch (_) { return null; }
        }
        function guardarCsvEnCache(hoja, texto) {
            try { sessionStorage.setItem('ia_csv_' + hoja, JSON.stringify({ ts: Date.now(), texto: texto })); } catch (_) {}
        }

        async function descargarHoja(hoja, forzar) {
            if (!forzar) {
                const enCache = csvDeCache(hoja);
                if (enCache) return enCache;
            }
            const url = urlDatos(hoja, forzar);   // puede lanzar si falta la URL
            const r = await fetch(url);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const texto = await r.text();
            // v5.3: el backend responde JSON cuando la sesión no es válida
            if (texto.charAt(0) === '{' && /"ok"\s*:\s*false/.test(texto)) {
                let msg = 'El servidor rechazó la petición.';
                try { msg = JSON.parse(texto).error || msg; } catch (_) {}
                throw new Error(msg);
            }
            guardarCsvEnCache(hoja, texto);
            return texto;
        }

        /* ============================================================
           v3.4 — LA PLATAFORMA COMO APLICACIÓN INSTALABLE

           Con el service worker registrado, la plataforma se puede agregar a
           la pantalla de inicio del teléfono o al escritorio y abrirse como
           aplicación. Además queda una copia local de las librerías externas,
           que es lo que la salva cuando la red del hospital las bloquea, y de
           la última descarga de datos, para poder consultar sin señal.

           Requiere HTTPS. En GitHub Pages funciona; abriendo el archivo con
           doble clic (file://) no, y ahí simplemente no se registra nada.
           ============================================================ */
        let promptInstalacion = null;
        let registroSW = null;

        function esAplicacionInstalada() {
            return window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true;
        }

        function registrarServiceWorker() {
            if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

            navigator.serviceWorker.register('sw.js').then((reg) => {
                registroSW = reg;

                // Ya hay una versión nueva esperando de una visita anterior
                if (reg.waiting) mostrarAvisoActualizacion(reg.waiting);

                reg.addEventListener('updatefound', () => {
                    const nuevo = reg.installing;
                    if (!nuevo) return;
                    nuevo.addEventListener('statechange', () => {
                        // 'installed' con un controlador activo = actualización lista
                        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
                            mostrarAvisoActualizacion(nuevo);
                        }
                    });
                });
            }).catch((err) => console.warn('No se pudo registrar el service worker:', err));

            // Al tomar el control la versión nueva, se recarga una sola vez
            let recargando = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (recargando) return;
                recargando = true;
                location.reload();
            });
        }

        function mostrarAvisoActualizacion(worker) {
            const aviso = document.getElementById('avisoActualizacion');
            aviso.classList.remove('hidden');
            document.getElementById('btnAplicarActualizacion').onclick = () => {
                aviso.classList.add('hidden');
                registrarEvento('actualizar_version', 'Aplicó la versión nueva');
                worker.postMessage('ACTIVAR_AHORA');
            };
            document.getElementById('btnPosponerActualizacion').onclick = () => aviso.classList.add('hidden');
        }

        /* El navegador avisa cuando la instalación es posible; hasta entonces
           el botón permanece oculto, para no ofrecer algo que no funcionaría. */
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            promptInstalacion = e;
            seOfrecioInstalacion = true;
            const btn = document.getElementById('btnInstalarApp');
            if (btn && !esAplicacionInstalada()) { btn.classList.remove('hidden'); btn.classList.add('flex'); }
        });

        window.addEventListener('appinstalled', () => {
            promptInstalacion = null;
            const btn = document.getElementById('btnInstalarApp');
            if (btn) { btn.classList.add('hidden'); btn.classList.remove('flex'); }
            registrarEvento('app_instalada', 'La plataforma se instaló en el equipo');
            mostrarAviso('La plataforma quedó instalada. Ya puedes abrirla desde el icono, como cualquier otra aplicación.');
        });

        document.getElementById('btnInstalarApp').addEventListener('click', async () => {
            if (!promptInstalacion) {
                avisar('Para instalarla, usa el menú del navegador:\n\n' +
                      '· Chrome (computadora): icono de instalar en la barra de direcciones\n' +
                      '· Android: menú ⋮ → Agregar a pantalla principal\n' +
                      '· iPhone / iPad: Compartir → Agregar a inicio');
                return;
            }
            promptInstalacion.prompt();
            const eleccion = await promptInstalacion.userChoice;
            registrarEvento('instalacion_' + (eleccion.outcome === 'accepted' ? 'aceptada' : 'rechazada'));
            promptInstalacion = null;
            document.getElementById('btnInstalarApp').classList.add('hidden');
        });

        /* ============================================================
           v3.6 — CADA QUIEN CAMBIA SU PROPIO PIN

           El servidor identifica a la persona por el PIN actual que escribe,
           igual que en el ingreso. No hace falta ser administrador, pero sí
           demostrar que ese PIN es suyo: así nadie puede cambiarle el PIN a
           otro, y el administrador no se entera del PIN nuevo.
           ============================================================ */
        function mensajePinUI(texto, tipo) {
            const el = document.getElementById('mensajePin');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-700 border border-green-200',
                info:  'bg-slate-100 text-slate-600 border border-slate-200'
            };
            el.className = 'text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        function abrirCambiarPin() {
            ['pinActual', 'pinNuevo', 'pinConfirmar'].forEach(id => document.getElementById(id).value = '');
            mensajePinUI('', 'info');
            const m = document.getElementById('modalCambiarPin');
            m.classList.remove('hidden'); m.classList.add('flex');
            setTimeout(() => document.getElementById('pinActual').focus(), 60);
        }

        function cerrarCambiarPin() {
            const m = document.getElementById('modalCambiarPin');
            m.classList.add('hidden'); m.classList.remove('flex');
            ['pinActual', 'pinNuevo', 'pinConfirmar'].forEach(id => document.getElementById(id).value = '');
        }

        async function guardarPinNuevo() {
            const actual = document.getElementById('pinActual').value.trim();
            const nuevo = document.getElementById('pinNuevo').value.trim();
            const confirmar = document.getElementById('pinConfirmar').value.trim();

            if (!actual || !nuevo) { mensajePinUI('Escribe tu PIN actual y el nuevo.', 'error'); return; }
            if (nuevo !== confirmar) { mensajePinUI('El PIN nuevo y su confirmación no coinciden.', 'error'); return; }
            if (nuevo.length < 6) { mensajePinUI('El PIN nuevo debe tener al menos 6 caracteres.', 'error'); return; }
            if (nuevo === actual) { mensajePinUI('El PIN nuevo es igual al actual.', 'error'); return; }

            const btn = document.getElementById('btnGuardarPin');
            btn.disabled = true; btn.innerText = 'Guardando…';
            try {
                if (!hayBackend()) {
                    await cambiarPinLocal(actual, nuevo);
                } else {
                    const r = await fetch(URL_APPS_SCRIPT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            accion: 'cambiarPin', token: tokenSesion(),
                            pinActual: actual, pinNuevo: nuevo,
                            dispositivo: idDispositivo(), fecha: new Date().toISOString()
                        })
                    });
                    const j = await r.json().catch(() => null);
                    if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo cambiar el PIN.');
                    // v5.3: la sesión va ligada al PIN; el servidor entrega una nueva
                    if (j.token) guardarSesion(j.nombre, j.rol, j.token, j.expira);
                }

                cerrarCambiarPin();
                registrarEvento('cambio_pin', 'Cambió su PIN de acceso');
                mostrarAviso('Tu PIN quedó cambiado. El anterior dejó de servir: usa el nuevo la próxima vez que entres.');
            } catch (err) {
                mensajePinUI(err.message, 'error');
            } finally {
                btn.disabled = false; btn.innerText = 'Cambiar PIN';
            }
        }

        document.getElementById('btnGuardarPin').addEventListener('click', guardarPinNuevo);
        document.getElementById('modalCambiarPin').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); guardarPinNuevo(); }
        });

        // Modo local (sin backend): mismo comportamiento, sobre este navegador
        async function cambiarPinLocal(actual, nuevo) {
            const lista = usuariosLocales();
            const h = await huellaLocal(actual);
            const u = lista.find(x => x.activo && x.huella === h);
            if (!u) throw new Error('El PIN actual no es correcto.');
            const hn = await huellaLocal(nuevo);
            if (lista.some(x => x !== u && x.huella === hn)) {
                throw new Error('Ese PIN ya lo tiene otro usuario. Elige uno diferente.');
            }
            u.huella = hn;
            escribirUsuariosLocales(lista);
        }

        /* ============================================================
           v3.4.1 — DIAGNÓSTICO DE INSTALACIÓN

           El navegador solo ofrece instalar cuando se cumplen TODOS sus
           requisitos, y cuando falta uno no dice cuál: simplemente no aparece
           el icono. Esto los revisa uno por uno y señala el que falla.
           Se abre con el enlace del menú lateral o agregando ?diagnostico=1
           a la dirección.
           ============================================================ */
        let seOfrecioInstalacion = false;

        async function ejecutarDiagnostico() {
            const panel = document.getElementById('panelDiagnostico');
            const cont = document.getElementById('resultadoDiagnostico');
            panel.classList.remove('hidden'); panel.classList.add('flex');
            cont.innerHTML = '<p class="text-slate-500 italic">Revisando…</p>';

            const puntos = [];
            const ok   = (t, d) => puntos.push({ estado: 'ok', titulo: t, detalle: d });
            const mal  = (t, d) => puntos.push({ estado: 'mal', titulo: t, detalle: d });
            const nota = (t, d) => puntos.push({ estado: 'nota', titulo: t, detalle: d });

            // 1. Origen seguro
            const hostLocal = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) > -1;
            if (location.protocol === 'https:' || hostLocal) {
                ok('Conexión segura (HTTPS)', location.origin);
            } else if (location.protocol === 'file:') {
                mal('Conexión segura (HTTPS)',
                    'La página se abrió como archivo local (file://). Así el navegador nunca ofrece instalar. Ábrela desde su dirección de GitHub Pages.');
            } else {
                mal('Conexión segura (HTTPS)', 'El sitio se está sirviendo por ' + location.protocol + ', y se requiere https.');
            }

            // 2. ¿Ya está instalada?
            if (esAplicacionInstalada()) {
                nota('Ya está instalada', 'Estás viendo la versión instalada, por eso no aparece el icono de instalar.');
            }

            // 3. Manifiesto
            const enlaceManifiesto = document.querySelector('link[rel="manifest"]');
            if (!enlaceManifiesto) {
                mal('Manifiesto enlazado', 'Falta la etiqueta <link rel="manifest"> en la página.');
            } else {
                try {
                    const r = await fetch(enlaceManifiesto.href, { cache: 'no-store' });
                    if (!r.ok) {
                        mal('manifest.json accesible',
                            'El navegador recibió un error ' + r.status + ' al pedirlo. Revisa que el archivo esté subido junto a index.html.');
                    } else {
                        const m = await r.json();
                        ok('manifest.json accesible', enlaceManifiesto.href);
                        const faltan = ['name', 'start_url', 'display', 'icons'].filter(k => !m[k]);
                        if (faltan.length) mal('Contenido del manifiesto', 'Faltan campos: ' + faltan.join(', '));
                        else ok('Contenido del manifiesto', 'name, start_url, display e icons presentes');

                        // 4. Iconos: deben existir 192 y 512, y descargarse
                        const tam = (m.icons || []).map(i => i.sizes).join(' ');
                        if (tam.indexOf('192x192') === -1 || tam.indexOf('512x512') === -1) {
                            mal('Tamaños de icono', 'Se requieren un icono de 192x192 y otro de 512x512. Declarados: ' + (tam || 'ninguno'));
                        } else {
                            ok('Tamaños de icono', '192x192 y 512x512 declarados');
                        }
                        for (const icono of (m.icons || [])) {
                            const url = new URL(icono.src, enlaceManifiesto.href).href;
                            try {
                                const ri = await fetch(url, { cache: 'no-store' });
                                if (ri.ok) ok('Icono ' + icono.sizes, url);
                                else mal('Icono ' + icono.sizes, 'Error ' + ri.status + ' al descargarlo: ' + url);
                            } catch (e) {
                                mal('Icono ' + icono.sizes, 'No se pudo descargar: ' + url);
                            }
                        }
                    }
                } catch (e) {
                    mal('manifest.json accesible', 'No se pudo leer o no es un JSON válido: ' + e.message);
                }
            }

            // 5. Service worker
            if (!('serviceWorker' in navigator)) {
                mal('Service worker', 'Este navegador no lo admite.');
            } else {
                try {
                    const reg = await navigator.serviceWorker.getRegistration();
                    if (!reg) {
                        mal('Service worker registrado',
                            'No hay ninguno. Suele significar que sw.js no está subido junto a index.html, o que devolvió un error al cargarse.');
                    } else if (reg.active) {
                        ok('Service worker activo', 'Ámbito: ' + reg.scope);
                    } else {
                        nota('Service worker instalándose', 'Aún no toma el control. Recarga la página y vuelve a revisar.');
                    }
                    // ¿sw.js se descarga?
                    const rs = await fetch('sw.js', { cache: 'no-store' });
                    if (rs.ok) ok('sw.js accesible', new URL('sw.js', location.href).href);
                    else mal('sw.js accesible', 'Error ' + rs.status + '. Verifica que el archivo esté subido.');
                } catch (e) {
                    mal('Service worker', e.message);
                }
            }

            // 6. Invitación del navegador
            if (seOfrecioInstalacion || promptInstalacion) {
                ok('El navegador ofreció la instalación', 'Usa el botón "Instalar aplicación" del menú lateral.');
            } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                nota('Navegador iOS',
                     'Safari nunca muestra el icono de instalar ni avisa a la página. La instalación se hace a mano: Compartir → Agregar a inicio.');
            } else if (!esAplicacionInstalada()) {
                nota('El navegador todavía no la ofrece',
                     'Si todo lo anterior salió bien, suele bastar con recargar una vez, o cerrar y volver a abrir el navegador. ' +
                     'Chrome también espera a que el sitio se haya usado un momento antes de ofrecerla.');
            }

            const icono = { ok: '✓', mal: '✕', nota: 'i' };
            const color = {
                ok:   'bg-green-50 border-green-200 text-green-800',
                mal:  'bg-red-50 border-red-200 text-red-800',
                nota: 'bg-amber-50 border-amber-200 text-amber-800'
            };
            const fallas = puntos.filter(p => p.estado === 'mal').length;

            cont.innerHTML =
                (fallas === 0
                    ? '<p class="mb-4 text-sm text-slate-600">No se encontró ningún requisito incumplido. Si aun así no aparece el icono, revisa las notas de abajo.</p>'
                    : '<p class="mb-4 text-sm font-semibold text-red-700">' + fallas + ' punto(s) impiden la instalación. Corrige los marcados en rojo.</p>') +
                puntos.map(p =>
                    '<div class="flex gap-3 items-start border rounded-lg p-3 mb-2 ' + color[p.estado] + '">' +
                        '<span class="font-bold shrink-0 w-4 text-center">' + icono[p.estado] + '</span>' +
                        '<div class="min-w-0"><p class="font-semibold">' + esc(p.titulo) + '</p>' +
                        '<p class="text-xs opacity-90 break-words">' + esc(p.detalle) + '</p></div>' +
                    '</div>').join('');
        }

        function cerrarDiagnostico() {
            const panel = document.getElementById('panelDiagnostico');
            panel.classList.add('hidden'); panel.classList.remove('flex');
        }

        if (new URLSearchParams(location.search).get('diagnostico') === '1') {
            window.addEventListener('load', () => setTimeout(ejecutarDiagnostico, 400));
        }

        registrarServiceWorker();

        /* ============================================================
           v3.3 — PANTALLA DE CARGA CON AVANCE REAL

           El porcentaje NO es un temporizador decorativo: cada etapa lo
           empuja cuando termina de verdad, y el 100 % solo aparece cuando el
           panel ya quedó armado. Entre una etapa y otra el número se acerca
           al objetivo con una animación suave, para que se vea vivo sin
           mentir sobre el avance: nunca rebasa lo que realmente se completó.

           Si una descarga tarda, el número se queda en su etapa y quien mira
           la pantalla lo entiende por el texto de abajo ("Descargando órdenes
           de trabajo"), mientras el arco que gira indica que sigue trabajando.
           ============================================================ */
        const progresoCarga = (() => {
            let objetivo = 0, actual = 0, animando = false;
            const CIRC = 326.7;   // 2 · π · 52, el perímetro del anillo

            function pintar() {
                const anillo = document.getElementById('anilloProgreso');
                const texto = document.getElementById('porcentajeCarga');
                if (!anillo || !texto) return;
                anillo.setAttribute('stroke-dashoffset', String(CIRC * (1 - actual / 100)));
                texto.innerHTML = Math.round(actual) + '<span style="font-size:1.125rem;color:#94a3b8">%</span>';
            }

            function animar() {
                if (Math.abs(objetivo - actual) < 0.4) {
                    actual = objetivo; pintar(); animando = false; return;
                }
                // avance proporcional: rápido al inicio del tramo, suave al final
                actual += (objetivo - actual) * 0.14;
                pintar();
                requestAnimationFrame(animar);
            }

            return {
                iniciar(etapa) {
                    objetivo = 0; actual = 0; animando = false;
                    pintar();
                    this.etapa(etapa || 'Iniciando');
                    const b = document.getElementById('loadingBanner');
                    if (b) { b.style.display = 'flex'; b.style.opacity = '1'; }
                },
                a(pct, etapa) {
                    objetivo = Math.max(objetivo, Math.min(100, pct));
                    if (etapa) this.etapa(etapa);
                    if (!animando) { animando = true; requestAnimationFrame(animar); }
                },
                etapa(texto) {
                    const el = document.getElementById('etapaCarga');
                    if (el) el.innerText = texto;
                },
                // Cierra solo cuando el número alcanzó el 100 en pantalla
                terminar() {
                    this.a(100, 'Listo');
                    const b = document.getElementById('loadingBanner');
                    if (!b) return;
                    const esperar = () => {
                        if (actual < 99.5) { requestAnimationFrame(esperar); return; }
                        b.style.transition = 'opacity 260ms ease';
                        b.style.opacity = '0';
                        setTimeout(() => { b.style.display = 'none'; b.style.transition = ''; }, 280);
                    };
                    requestAnimationFrame(esperar);
                },
                ocultar() {
                    const b = document.getElementById('loadingBanner');
                    if (b) { b.style.display = 'none'; b.style.opacity = '1'; }
                }
            };
        })();

        let primeraNavegacionHecha = false;   // v5.4: enlaces directos
        async function cargarDatos(forzar) {
            progresoCarga.iniciar(forzar === true ? 'Solicitando información actualizada' : 'Conectando');
            document.getElementById('errorBanner').classList.add('hidden');
            document.getElementById('avisoBanner').classList.add('hidden');
            progresoCarga.a(8, 'Descargando órdenes de trabajo');

            // v2.6: descargas independientes; la hoja de órdenes es obligatoria,
            // la de KPIs solo degrada los indicadores superiores si falla.
            // v2.9: se suma el catálogo de equipos de calibración (opcional).
            /* Cada hoja empuja el avance en cuanto llega, sin esperar a las
               otras: así el número refleja lo que de verdad ya se descargó. */
            const conAvance = (promesa, pct, etapa) =>
                promesa.then(v => { progresoCarga.a(pct, etapa); return v; },
                             e => { progresoCarga.a(pct); throw e; });

            const [rDash, rCorpus, rPatrones, rPrecios] = await Promise.allSettled([
                conAvance(descargarHoja('dashboard', forzar === true), 30, 'Indicadores recibidos'),
                conAvance(descargarHoja('corpus', forzar === true), 55, 'Órdenes de trabajo recibidas'),
                conAvance(descargarHoja('patrones', forzar === true), 60, 'Catálogo de patrones recibido'),
                conAvance(descargarHoja('precios', forzar === true), 63, 'Tarifario recibido')
            ]);
            progresoCarga.a(65, 'Leyendo la información');

            const csvTextoDashboard = rDash.status === 'fulfilled' ? rDash.value : null;
            const csvTextoCorpus    = rCorpus.status === 'fulfilled' ? rCorpus.value : null;
            const csvTextoPatrones  = rPatrones.status === 'fulfilled' ? rPatrones.value : null;
            const csvTextoPrecios   = rPrecios.status === 'fulfilled' ? rPrecios.value : null;

            // v3.4: si no hay señal, el service worker sirvió la última copia
            if (!navigator.onLine && csvTextoCorpus) {
                mostrarAviso('Sin conexión: se está mostrando la última información descargada en este equipo. ' +
                             'Vuelve a pulsar Actualizar cuando recuperes señal.');
            }

            if (!csvTextoCorpus) {
                progresoCarga.ocultar();
                mostrarError("Error de Conexión: no fue posible descargar las órdenes de trabajo. Verifica que la hoja siga publicada (o la configuración de Apps Script) y tu conexión a internet.");
                return;
            }

            datosAgrupadosPorMes = [];
            if (csvTextoDashboard) {
                Papa.parse(csvTextoDashboard, {
                    header: true, skipEmptyLines: true,
                    transformHeader: function(h) { return h.trim().toLowerCase(); },
                    complete: function(results) { datosAgrupadosPorMes = results.data; }
                });
            } else {
                mostrarAviso("No se pudo descargar la hoja de KPIs mensuales; los indicadores superiores se muestran en cero. El resto del panel funciona con normalidad.");
            }

            progresoCarga.a(72, 'Organizando órdenes por unidad');
            Papa.parse(csvTextoCorpus, {
                header: true, skipEmptyLines: true,
                transformHeader: function(h) { return normalizar(h.trim().toLowerCase()); },
                complete: function(results) { procesarDatosCorpus(results.data); }
            });
            progresoCarga.a(88, 'Calculando mantenimientos');

            // v2.9: catálogo de equipos patrón. Su ausencia NO es un error:
            // la rutina simplemente imprime el texto de la orden sin
            // certificado ni vigencia.
            catalogoPatrones = [];
            if (csvTextoPatrones) {
                Papa.parse(csvTextoPatrones, {
                    header: true, skipEmptyLines: true,
                    transformHeader: function(h) { return normalizar(h.trim().toLowerCase()); },
                    complete: function(results) { procesarCatalogoPatrones(results.data); }
                });
            }

            /* v3.8: tarifario. Su ausencia NO es un error: el panel funciona
               igual y solo la exportación valorizada queda sin precios. */
            catalogoPrecios = [];
            if (csvTextoPrecios) {
                Papa.parse(csvTextoPrecios, {
                    header: true, skipEmptyLines: true,
                    transformHeader: function(h) { return normalizar(h.trim().toLowerCase()); },
                    complete: function(results) { procesarCatalogoPrecios(results.data); }
                });
            }

            progresoCarga.a(94, 'Armando el panel');
            document.getElementById('ultimaActualizacion').innerText =
                'Datos actualizados: ' + new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) +
                (ordenesExcluidasPorMarcador > 0
                    ? ' · ' + ordenesExcluidasPorMarcador + ' orden(es) de prueba omitida(s)'
                    : '');

            generarSidebarClientes(document.getElementById('buscadorClientes').value || '');

            actualizarBadgeProximos();   // v5.4

            // Si estábamos viendo un cliente, conservar la vista tras refrescar
            // v5.4: en la primera carga manda la dirección (#unidad/…, #proximos…)
            const visible = (id) => !document.getElementById(id).classList.contains('hidden');
            if (!primeraNavegacionHecha) {
                primeraNavegacionHecha = true;
                if (!navegarDesdeHash()) { clienteActual = ''; mostrarDashboard(); }
            } else if (visible('proximosContent')) {
                poblarFiltrosProximos(); renderProximos();
            } else if (clienteActual && clientesUnicos.includes(clienteActual)) {
                mostrarVistaCliente(clienteActual);
            } else {
                clienteActual = '';
                mostrarDashboard();
            }

            // v3.8: facturas registradas (para la columna Factura de las pestañas)
            await cargarFacturas();

            progresoCarga.terminar();

            // v2.6: sincronizar canales/seguimientos con el backend (si existe)
            sincronizarComRemoto();
        }

        function ocultarError() {
            document.getElementById('errorBanner').classList.add('hidden');
        }

        function mostrarError(mensaje) {
            progresoCarga.ocultar();
            document.getElementById('errorBanner').classList.remove('hidden');
            document.getElementById('errorTexto').innerText = mensaje;
        }

        /* v4.2: un aviso es una confirmación pasajera, no un letrero fijo. Se
           retira solo a los 8 segundos, y cada aviso nuevo reinicia el reloj
           en lugar de encimarse con el anterior. */
        let relojAviso = null;

        function mostrarAviso(mensaje, segundos) {
            const banner = document.getElementById('avisoBanner');
            document.getElementById('avisoTexto').innerText = mensaje;
            banner.classList.remove('hidden');
            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            clearTimeout(relojAviso);
            relojAviso = setTimeout(ocultarAviso, (segundos || 8) * 1000);
        }

        function ocultarAviso() {
            clearTimeout(relojAviso);
            document.getElementById('avisoBanner').classList.add('hidden');
        }

        /* ============================================================
           FIX FECHAS: soporta seriales de Excel/Sheets, formato ISO,
           y resuelve la ambigüedad D/M vs M/D con heurística + FORMATO_FECHA
           ============================================================ */
        function parsearFechaMantenimiento(fechaStr) {
            if (fechaStr === null || fechaStr === undefined) return null;
            let s = String(fechaStr).trim();
            if (!s || s === 'N/A' || s === '.') return null;

            // Serial numérico de Excel/Google Sheets (ej. 46128.676)
            if (/^\d{4,6}(\.\d+)?$/.test(s)) {
                const serial = parseFloat(s);
                if (serial > 20000 && serial < 80000) {
                    return new Date(Math.round((serial - 25569) * 86400000));
                }
            }

            const soloFecha = s.split(' ')[0];
            const parts = soloFecha.split(/[-\/]/);

            if (parts.length >= 3) {
                const p = parts.map(x => parseInt(x, 10));
                if (p.some(isNaN)) {
                    const ts = Date.parse(s);
                    return isNaN(ts) ? null : new Date(ts);
                }
                let y, m, d;
                if (parts[0].length === 4) {
                    // Formato ISO AAAA-MM-DD
                    y = p[0]; m = p[1]; d = p[2];
                } else {
                    y = parts[2].length === 4 ? p[2] : 2000 + p[2];
                    if (p[0] > 12)      { d = p[0]; m = p[1]; }   // primer número > 12 => es día
                    else if (p[1] > 12) { m = p[0]; d = p[1]; }   // segundo número > 12 => es día
                    else if (FORMATO_FECHA === 'MDY') { m = p[0]; d = p[1]; }
                    else                { d = p[0]; m = p[1]; }
                }
                if (m < 1 || m > 12 || d < 1 || d > 31) return null;
                return new Date(Date.UTC(y, m - 1, d, 12));
            }

            const ts = Date.parse(s);
            return isNaN(ts) ? null : new Date(ts);
        }

        /* ============================================================
           FIX COLUMNAS: búsqueda con prioridad (exacta > inicia con > contiene)
           para evitar que "Valores de Referencia 1" gane sobre
           "Valores de Medición", o "Detalle de Funcionalidad" sobre
           "Observaciones".
           ============================================================ */
        function buscarColumna(llaves, candidatos) {
            for (const c of candidatos) {
                const exacta = llaves.find(l => l === c);
                if (exacta) return exacta;
            }
            for (const c of candidatos) {
                const inicia = llaves.find(l => l.startsWith(c));
                if (inicia) return inicia;
            }
            for (const c of candidatos) {
                const contiene = llaves.find(l => l.includes(c));
                if (contiene) return contiene;
            }
            return undefined;
        }

        function frecuenciaParaEquipo(nombreEquipo) {
            const eqNorm = normalizar(String(nombreEquipo).toLowerCase());
            const regla = FRECUENCIAS_MESES.find(r => eqNorm.includes(r.clave));
            return regla ? regla.meses : FRECUENCIA_DEFAULT;
        }

        /* v2.8: ¿la celda marcadora indica que el registro debe excluirse?
           La celda vacía nunca excluye; se ignoran acentos, mayúsculas y espacios. */
        function estaMarcadaParaExcluir(valor) {
            const v = normalizar(String(valor ?? '').trim().toLowerCase());
            if (!v) return false;
            return MARCAS_EXCLUSION.some(m => v === normalizar(m));
        }

        // Contador de registros descartados por el marcador (se muestra en el sello de hora)
        let ordenesExcluidasPorMarcador = 0;

        function procesarDatosCorpus(data) {
            datosDetalleOrdenes = [];
            ordenesExcluidasPorMarcador = 0;
            const clientesSet = new Set();

            if (data.length === 0) return;

            const llaves = Object.keys(data[0]);

            // Nota: los encabezados ya llegan en minúsculas y sin acentos,
            // conservando los dos puntos finales cuando existen (ej. "equipo:").
            const cID     = buscarColumna(llaves, ['id unico', 'idunico', 'submission id', 'folio', 'orden']);
            const cIng    = buscarColumna(llaves, ['ingeniero de servicio', 'ingeniero', 'tecnico', 'encargado']);
            const cEq     = buscarColumna(llaves, ['equipo:', 'equipo']);
            const cTipo   = buscarColumna(llaves, ['tipo de servicio o mantenimiento', 'tipo de servicio', 'tipo de mantenimiento']);
            const cCli    = buscarColumna(llaves, ['unidad:', 'unidad', 'cliente', 'hospital']);
            const cMarca  = buscarColumna(llaves, ['marca:', 'marca']);
            const cMod    = buscarColumna(llaves, ['modelo:', 'modelo']);
            const cSer    = buscarColumna(llaves, ['serie:', 'serie', 's/n']);
            const cInv    = buscarColumna(llaves, ['inventario:', 'inventario']);
            const cArea   = buscarColumna(llaves, ['area o ubicacion:', 'area o ubicacion', 'area', 'departamento', 'ubicacion']);
            const cFecha  = buscarColumna(llaves, ['fecha de inicio:', 'fecha de inicio', 'marca temporal', 'timestamp', 'fecha']);
            const cFechaFin = buscarColumna(llaves, ['fecha de fin:', 'fecha de fin', 'fecha fin']);

            const cDir    = buscarColumna(llaves, ['domicilio:', 'domicilio', 'direccion', 'calle']);
            const cTel    = buscarColumna(llaves, ['telefono:', 'telefono', 'tel', 'celular']);
            const cCor    = buscarColumna(llaves, ['email', 'correo']);

            const cEst    = buscarColumna(llaves, ['estatus de seguimiento', 'estatus', 'seguimiento']);
            // FIX: observaciones y detalle por separado (antes 'detalle' capturaba primero)
            const cObs    = buscarColumna(llaves, ['observaciones:', 'observaciones', 'observacion']);
            const cDet    = buscarColumna(llaves, ['detalle de funcionalidad:', 'detalle de funcionalidad', 'detalle', 'falla']);

            // FIX: solo la columna correcta de mediciones (búsqueda exacta primero)
            const cValores = buscarColumna(llaves, ['valores de medicion', 'resultados de medicion', 'mediciones']);
            const cCalibracion = buscarColumna(llaves, ['datos del equipo de calibracion', 'equipo de calibracion', 'patron']);

            /* v2.8: columna "Indicador de Prueba" ("X" = el registro no se
               considera en ninguna parte del sistema). Si el nombre declarado
               en COLUMNA_EXCLUSION no está en la hoja, se intenta autodetectar
               y se avisa en la consola para que el filtro nunca falle en
               silencio (una orden de prueba contaminando los KPIs es peor que
               un aviso de más). */
            let cExcluir;
            if (COLUMNA_EXCLUSION) {
                cExcluir = buscarColumna(llaves, [normalizar(COLUMNA_EXCLUSION.trim().toLowerCase())]);
                if (!cExcluir) {
                    cExcluir = buscarColumna(llaves, CANDIDATOS_COLUMNA_EXCLUSION.map(c => normalizar(c)));
                    console.warn('No se encontró la columna "' + COLUMNA_EXCLUSION + '" en la hoja.' +
                                 (cExcluir ? ' Se usará "' + cExcluir + '" en su lugar.'
                                           : ' NINGUNA orden se filtrará por indicador de prueba.'));
                }
            } else {
                cExcluir = buscarColumna(llaves, CANDIDATOS_COLUMNA_EXCLUSION.map(c => normalizar(c)));
            }

            // FIX: las fotos viven en 4 columnas específicas del formato de Jotform
            const cFotoAntes   = buscarColumna(llaves, ['antes del mantenimiento']);
            const cFotoDurante = buscarColumna(llaves, ['durante el mantenimiento']);
            const cFotoFinal   = buscarColumna(llaves, ['al final del mantenimiento']);
            const cFotoSerie   = buscarColumna(llaves, ['foto numero de serie:', 'foto numero de serie']);

            data.forEach(row => {
                // v2.8: si "Indicador de Prueba" trae "X" (o cualquier valor de
                // MARCAS_EXCLUSION), el registro se descarta ANTES de procesarlo:
                // no entra a KPIs, gráficas, tablas de preventivos/correctivos,
                // oportunidades de venta, barra lateral ni generador de rutinas.
                if (cExcluir && estaMarcadaParaExcluir(row[cExcluir])) {
                    ordenesExcluidasPorMarcador++;
                    return;
                }

                let obj = {};

                obj['ID'] = cID ? (row[cID] || 'S/N').trim() : 'S/N';
                obj['Ingeniero'] = cIng ? (row[cIng] || 'Sin Asignar') : 'Sin Asignar';
                obj['Equipo'] = cEq ? (row[cEq] || 'Sin Equipo') : 'Sin Equipo';
                obj['Tipo de Servicio'] = cTipo ? (row[cTipo] || '') : '';
                obj['Cliente'] = cCli ? (row[cCli] || 'Sin Cliente').trim() : 'Sin Cliente';
                obj['Marca'] = cMarca ? (row[cMarca] || 'Sin Marca') : 'Sin Marca';
                obj['Modelo'] = cMod ? normalizarSerie(row[cMod] || 'N/A') : 'N/A';
                obj['Serie'] = cSer ? normalizarSerie(row[cSer] || 'N/A') : 'N/A';
                obj['Inventario'] = cInv ? normalizarSerie(row[cInv] || 'N/A') : 'N/A';
                obj['Area'] = cArea ? (row[cArea] || 'N/A') : 'N/A';
                obj['FechaEjecucion'] = cFecha ? (row[cFecha] || 'N/A') : 'N/A';
                obj['FechaFin'] = cFechaFin ? (row[cFechaFin] || '') : '';

                obj['Direccion'] = cDir ? (row[cDir] || 'Dirección no registrada') : 'Dirección no registrada';
                obj['Telefono'] = cTel ? (row[cTel] || 'Teléfono no registrado') : 'Teléfono no registrado';
                obj['Correo'] = cCor ? (row[cCor] || 'Correo no registrado') : 'Correo no registrado';

                obj['ValoresMedicion'] = cValores ? (row[cValores] || '') : '';
                obj['EquipoCalibracion'] = cCalibracion ? (row[cCalibracion] || 'No se especificó equipo patrón') : 'No se especificó equipo patrón';

                // FIX: fotos etiquetadas desde sus 4 columnas reales
                obj['Fotos'] = [];
                const agregarFoto = (col, etiqueta) => {
                    if (!col) return;
                    const url = String(row[col] || '').trim();
                    if (url && url !== 'undefined' && /^https?:\/\//i.test(url)) {
                        obj['Fotos'].push({ url: url, etiqueta: etiqueta });
                    }
                };
                agregarFoto(cFotoAntes, 'Antes');
                agregarFoto(cFotoDurante, 'Durante');
                agregarFoto(cFotoFinal, 'Al final');
                agregarFoto(cFotoSerie, 'No. de Serie');

                // FIX: clasificación con acentos normalizados; ENTREGA cae en la
                // pestaña de correctivos/asistencia para que ninguna orden se pierda
                const tipoNorm = normalizar(obj['Tipo de Servicio'].toLowerCase());
                /* v3.7: cuatro tipos de servicio, uno por pestaña. La
                   clasificación es EXCLUYENTE y por precedencia de lo más
                   específico a lo más general: una orden de "Preventivo con
                   calibración" cuenta como calibración y aparece una sola vez,
                   no en dos pestañas sumando doble en los conteos. */
                obj['esCalibracion'] = tipoNorm.includes('calibracion');
                obj['esEntrega']     = !obj['esCalibracion'] &&
                                       (tipoNorm.includes('entrega') || tipoNorm.includes('material'));
                obj['esCorrectivo']  = !obj['esCalibracion'] && !obj['esEntrega'] &&
                                       (tipoNorm.includes('correctivo') || tipoNorm.includes('asistencia'));
                obj['esPreventivo']  = !obj['esCalibracion'] && !obj['esEntrega'] && !obj['esCorrectivo'] &&
                                       tipoNorm.includes('preventivo');

                // Compatibilidad con el resto del código (KPIs, oportunidades)
                obj['esPrev'] = obj['esPreventivo'] || obj['esCalibracion'];
                obj['esCorr'] = obj['esCorrectivo'] || obj['esEntrega'];

                const dateObj = parsearFechaMantenimiento(obj['FechaEjecucion']);
                obj['FechaObj'] = dateObj;
                if (dateObj) {
                    obj['FechaEjecucionStr'] = dateObj.toLocaleDateString('es-MX', { timeZone: 'UTC' });
                    // FIX: el mes se deriva de la fecha (la hoja no tiene columna "Mes")
                    obj['Mes'] = MESES_ES[dateObj.getUTCMonth()];
                    // v3.1: el año permite acotar la búsqueda conforme crece el histórico
                    obj['Anio'] = String(dateObj.getUTCFullYear());

                    // MEJORA: frecuencia configurable por tipo de equipo (antes fijo +6)
                    const mesesFrec = frecuenciaParaEquipo(obj['Equipo']);
                    const nextDate = new Date(dateObj);
                    nextDate.setUTCMonth(nextDate.getUTCMonth() + mesesFrec);
                    obj['ProximoMantDate'] = nextDate;
                    obj['ProximoMantStr'] = nextDate.toLocaleDateString('es-MX', { timeZone: 'UTC' });
                    obj['MesProximoMant'] = nextDate.getUTCMonth() + 1;
                } else {
                    obj['FechaEjecucionStr'] = (obj['FechaEjecucion'] !== 'N/A' && obj['FechaEjecucion'] !== '') ? obj['FechaEjecucion'] : 'Sin Fecha Registrada';
                    obj['Mes'] = 'sin mes';
                    obj['Anio'] = 'sin año';
                    obj['ProximoMantDate'] = null;
                    obj['ProximoMantStr'] = 'Sin Fecha Válida';
                    obj['MesProximoMant'] = -1;
                }

                const estatusRaw = cEst ? (row[cEst] || '').toUpperCase().trim() : '';
                const estatusLimpio = normalizar(estatusRaw);

                obj['estatus_seguimiento_limpio'] = estatusLimpio;
                obj['oportunidad'] = false;
                obj['motivo_venta'] = '';

                const textoObs = cObs ? (row[cObs] || '').trim() : '';
                const textoDet = cDet ? (row[cDet] || '').trim() : '';

                if (estatusLimpio.includes('REQUIERE COTIZACION')) {
                    obj['oportunidad'] = true;
                    obj['motivo_venta'] = textoObs || textoDet || estatusRaw;
                }

                // MEJORA: detectar y excluir órdenes de prueba
                const textoCompleto = normalizar((textoObs + ' ' + textoDet).toLowerCase());
                obj['esPrueba'] = textoCompleto.includes('orden de prueba') || textoCompleto.includes('es una prueba');

                if (obj['ID'] !== 'S/N' && obj['ID'] !== '') {
                    if (EXCLUIR_ORDENES_PRUEBA && obj['esPrueba']) return;
                    datosDetalleOrdenes.push(obj);
                    if (obj['Cliente'] !== 'Sin Cliente' && obj['Cliente'] !== '') {
                        clientesSet.add(obj['Cliente']);
                    }
                }
            });

            clientesUnicos = Array.from(clientesSet).sort();
        }


        /* ============================================================
           v2.9 — CATÁLOGO DE EQUIPOS DE CALIBRACIÓN (pestaña "datos equipo
           de calibracion")
           Alimenta la sección de Datos del Equipo de Calibración de la rutina
           con el número de certificado y la vigencia de calibración del
           analizador utilizado. La búsqueda se hace por NOMBRE del equipo
           contra el texto que la orden registró en "DATOS DEL EQUIPO DE
           CALIBRACIÓN".

           Columnas detectadas (sin distinguir acentos ni mayúsculas):
             Equipo / Analizador / Nombre   → nombre del patrón
             Marca · Modelo · Serie          → identificación (opcionales)
             Número de certificado           → certificado de calibración
             Vigencia de la calibración      → fecha de vencimiento
             Laboratorio                     → quien calibró (opcional)
           ============================================================ */
        let catalogoPatrones = [];

        /* ============================================================
           v3.8 — TARIFARIO DE MANTENIMIENTO

           Un renglón por tipo de equipo con tres niveles de precio. El nivel
           corresponde al convenio del hospital: la misma máquina de anestesia
           cuesta distinto según el convenio, y al exportar se elige cuál
           aplicar.

           El emparejamiento es por tipo de equipo, no por equipo del
           inventario: el tarifario dice "Ventilador" y la orden dice
           "Ventilador volumétrico Puritan Bennett 840". Se busca primero
           coincidencia exacta y luego por contención, prefiriendo siempre el
           nombre MÁS LARGO que coincida, para que "Ventilador neonatal" gane
           sobre "Ventilador" cuando ambos están en el tarifario.
           ============================================================ */
        let catalogoPrecios = [];

        const NIVELES_PRECIO = ['I', 'II', 'III'];

        function aNumeroPrecio(v) {
            const t = String(v ?? '').replace(/[^\d.,-]/g, '').replace(/,/g, '');
            if (!t) return null;
            const n = parseFloat(t);
            return Number.isFinite(n) ? n : null;
        }

        function procesarCatalogoPrecios(data) {
            catalogoPrecios = [];
            if (!data || data.length === 0) return;

            const llaves = Object.keys(data[0]);
            const cServicio = buscarColumna(llaves, ['tipo de servicio', 'servicio']);
            const cEquipo   = buscarColumna(llaves, ['tipo de equipo', 'equipo', 'equipo:', 'nombre del equipo']);
            const cN1 = buscarColumna(llaves, ['nivel i', 'nivel 1', 'nivel i)', 'precio nivel i', 'n1']);
            const cN2 = buscarColumna(llaves, ['nivel ii', 'nivel 2', 'precio nivel ii', 'n2']);
            const cN3 = buscarColumna(llaves, ['nivel iii', 'nivel 3', 'precio nivel iii', 'n3']);
            const cMoneda = buscarColumna(llaves, ['moneda', 'divisa']);
            const cUnidad = buscarColumna(llaves, ['unidad']);        // v4.8
            const cClave  = buscarColumna(llaves, ['no. catalogo', 'no catalogo', 'numero de catalogo', 'num. catalogo']); // v5.0
            const cMarca  = llaves.find(l => l === 'marca');                   // v5.2
            const cCateg  = llaves.find(l => l === 'categoria');

            data.forEach(row => {
                const equipo = cEquipo ? String(row[cEquipo] || '').trim() : '';
                if (!equipo) return;
                catalogoPrecios.push({
                    servicio: cServicio ? (String(row[cServicio] || '').trim() || 'Preventivo') : 'Preventivo',
                    equipo: equipo,
                    precios: {
                        I:   cN1 ? aNumeroPrecio(row[cN1]) : null,
                        II:  cN2 ? aNumeroPrecio(row[cN2]) : null,
                        III: cN3 ? aNumeroPrecio(row[cN3]) : null
                    },
                    moneda: cMoneda ? (String(row[cMoneda] || '').trim() || 'MXN') : 'MXN',
                    unidad: cUnidad ? String(row[cUnidad] || '').trim() : '',
                    clave: cClave ? String(row[cClave] || '').trim().toUpperCase() : '',
                    marca: cMarca ? String(row[cMarca] || '').trim() : '',
                    categoria: cCateg ? String(row[cCateg] || '').trim() : ''
                });
            });

            if (!cN1 && !cN2 && !cN3) {
                console.warn('[Tarifario] No se encontraron columnas de nivel (Nivel I / II / III). ' +
                             'Revisa los encabezados de la pestaña Precios_Mantenimiento.');
            }
        }

        /* Busca la tarifa de un equipo. 'servicio' filtra por tipo cuando el
           tarifario lo declara; si no hay renglón para ese servicio se usa el
           de Preventivo, que es el caso general. */
        function tarifaDeEquipo(nombreEquipo, servicio) {
            const n = normalizar(String(nombreEquipo || '').toLowerCase()).trim();
            if (!n || !catalogoPrecios.length) return null;
            const s = normalizar(String(servicio || 'preventivo').toLowerCase());

            const candidatos = catalogoPrecios.filter(t => {
                const ts = normalizar(t.servicio.toLowerCase());
                return !s || ts === s || ts === 'preventivo';
            });

            const exacto = candidatos.find(t => normalizar(t.equipo.toLowerCase()).trim() === n);
            if (exacto) return exacto;

            // Por contención, prefiriendo el nombre más específico (el más largo)
            const contenidos = candidatos
                .filter(t => {
                    const te = normalizar(t.equipo.toLowerCase()).trim();
                    return te.length >= 4 && (n.includes(te) || te.includes(n));
                })
                .sort((a, b) => b.equipo.length - a.equipo.length);

            return contenidos[0] || null;
        }

        /* ============================================================
           v4.1 — QUÉ SERVICIOS TIENEN TARIFA

           El tarifario cubre PREVENTIVOS y CALIBRACIONES, que son servicios
           de alcance conocido. Los CORRECTIVOS y las ENTREGAS/MATERIALES son
           de precio variable —dependen de la refacción, del tiempo, de lo que
           se entregó— y su importe se captura al asignar la factura.

           De ahí salen dos usos distintos:
             · en preventivos y calibraciones, comparar lo que se facturó
               contra lo que el tarifario dice que debía facturarse
             · en correctivos y entregas, ir formando la base de precios real
               con lo que efectivamente se cobró
           ============================================================ */
        function tieneTarifario(d) {
            return !!(d && (d.esPreventivo || d.esCalibracion));
        }

        // Mismo criterio a partir del texto del tipo de servicio
        function tipoConTarifario(tipoServicio) {
            const t = normalizar(String(tipoServicio || '').toLowerCase());
            if (t.includes('correctivo') || t.includes('asistencia') ||
                t.includes('entrega') || t.includes('material')) return false;
            return t.includes('preventivo') || t.includes('calibracion');
        }

        function precioDeEquipo(nombreEquipo, nivel, servicio) {
            const t = tarifaDeEquipo(nombreEquipo, servicio);
            if (!t) return null;
            const p = t.precios[nivel || 'I'];
            return (p === null || p === undefined) ? null : p;
        }

        const fmtMoneda = (n, moneda) => (n === null || n === undefined)
            ? '—'
            : new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda || 'MXN' }).format(n);

        function procesarCatalogoPatrones(data) {
            catalogoPatrones = [];
            if (!data || data.length === 0) return;

            const llaves = Object.keys(data[0]);
            const cNombre = buscarColumna(llaves, ['equipo de calibracion', 'analizador', 'equipo patron',
                                                   'patron', 'equipo:', 'equipo', 'nombre del equipo', 'nombre']);
            const cMarca  = buscarColumna(llaves, ['marca:', 'marca']);
            const cModelo = buscarColumna(llaves, ['modelo:', 'modelo']);
            const cSerie  = buscarColumna(llaves, ['serie:', 'serie', 's/n', 'numero de serie']);
            const cCert   = buscarColumna(llaves, ['numero de certificado', 'no. de certificado', 'no de certificado',
                                                   'certificado de calibracion', 'certificado', 'folio del certificado']);
            const cVig    = buscarColumna(llaves, ['vigencia de la calibracion', 'vigencia de calibracion',
                                                   'vigencia', 'vence', 'fecha de vencimiento', 'proxima calibracion']);
            const cLab    = buscarColumna(llaves, ['laboratorio', 'laboratorio de calibracion', 'proveedor']);

            data.forEach(row => {
                const nombre = cNombre ? String(row[cNombre] || '').trim() : '';
                if (!nombre) return;
                const vigTexto = cVig ? String(row[cVig] || '').trim() : '';
                const vigFecha = parsearFechaMantenimiento(vigTexto);
                catalogoPatrones.push({
                    nombre: nombre,
                    marca:  cMarca  ? String(row[cMarca]  || '').trim() : '',
                    modelo: cModelo ? String(row[cModelo] || '').trim() : '',
                    serie:  cSerie  ? normalizarSerie(row[cSerie] || '') : '',
                    certificado: cCert ? String(row[cCert] || '').trim() : '',
                    vigenciaTexto: vigTexto,
                    vigenciaFecha: vigFecha,
                    // Formato fijo dd/mm/aaaa: es un documento formal, no debe
                    // alternar entre "3/8/2026" y "15/11/2026"
                    vigenciaStr: vigFecha
                        ? vigFecha.toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })
                        : vigTexto,
                    laboratorio: cLab ? String(row[cLab] || '').trim() : '',
                    // Índice de búsqueda: nombre + marca + modelo + serie
                    indice: normalizar((nombre + ' ' + (cMarca ? row[cMarca] : '') + ' ' +
                                        (cModelo ? row[cModelo] : '') + ' ' +
                                        (cSerie ? row[cSerie] : '')).toLowerCase())
                });
            });
        }

        /* Busca el patrón que corresponde al texto de la orden.
           Estrategia por niveles, de más a menos confiable:
             1) el nombre del catálogo aparece completo dentro del texto
             2) el texto aparece completo dentro del índice del catálogo
             3) mayor número de palabras significativas en común (mínimo 1)
           Devuelve null si nada supera el umbral: es preferible no imprimir
           certificado a imprimir el de otro equipo. */
        function buscarPatronCalibracion(textoOrden) {
            const t = normalizar(String(textoOrden || '').toLowerCase()).trim();
            if (!t || !catalogoPatrones.length) return null;

            let exacto = catalogoPatrones.find(p => normalizar(p.nombre.toLowerCase()) === t);
            if (exacto) return exacto;

            /* El nombre del catálogo aparece completo dentro del texto de la
               orden. Si coinciden varios, gana el nombre más largo (el más
               específico): "Impulse 7000DP" antes que "Impulse". */
            const contenidos = catalogoPatrones.filter(p => {
                const n = normalizar(p.nombre.toLowerCase()).trim();
                return n.length >= 4 && t.includes(n);
            });
            if (contenidos.length) {
                return contenidos.sort((a, b) => b.nombre.length - a.nombre.length)[0];
            }

            /* El texto de la orden aparece dentro del índice del catálogo. Solo
               vale si identifica a UN registro: un texto como "Fluke" está
               contenido en todos los equipos de esa marca y no identifica nada,
               así que se deja pasar al conteo de palabras. */
            const contienen = catalogoPatrones.filter(p => t.length >= 4 && p.indice.includes(t));
            if (contienen.length === 1) return contienen[0];

            /* Coincidencia por palabras. Reglas estrictas a propósito: imprimir
               el certificado de OTRO equipo es peor que no imprimir ninguno.
                 · se ignoran conectores, palabras cortas y términos genéricos
                   del ramo (analizador, simulador, marca…), que por sí solos no
                   identifican nada
                 · se exigen al menos DOS palabras en común: con una sola, un
                   "Multímetro Fluke 87V" ausente del catálogo se emparejaba con
                   cualquier otro equipo Fluke
                 · si dos registros empatan en el puntaje máximo, la referencia
                   es ambigua y no se devuelve ninguno */
            const vacias = ['de', 'del', 'la', 'el', 'los', 'las', 'y', 'con', 'para',
                            'marca', 'modelo', 'serie', 'numero', 'equipo', 'analizador',
                            'simulador', 'patron', 'calibracion', 'medidor'];
            const palabras = t.split(/[^a-z0-9]+/).filter(p => p.length > 2 && !vacias.includes(p));
            if (palabras.length < 2) return null;

            let mejor = null, mejorPuntaje = 0, empates = 0;
            catalogoPatrones.forEach(p => {
                let puntaje = 0;
                palabras.forEach(w => { if (p.indice.includes(w)) puntaje++; });
                if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = p; empates = 1; }
                else if (puntaje === mejorPuntaje && puntaje > 0) { empates++; }
            });
            if (mejorPuntaje < 2 || empates > 1) return null;
            return mejor;
        }

        /* v2.9.1: devuelve TODOS los equipos patrón mencionados en la orden.
           Una misma rutina puede haberse levantado con varios analizadores
           (por ejemplo un simulador de paciente y un analizador de
           desfibriladores), y los seis deben quedar documentados si se usaron
           seis. Un registro se considera mencionado cuando su nombre, su
           modelo o su número de serie aparecen en el texto de la orden.
           Si nada coincide directamente, se recurre una sola vez a la
           coincidencia por palabras (estricta) para no perder los casos en que
           la orden escribió el nombre de forma aproximada. */
        function buscarPatronesCalibracion(textoOrden) {
            const t = normalizar(String(textoOrden || '').toLowerCase()).trim();
            if (!t || !catalogoPatrones.length) return [];

            const directos = catalogoPatrones.filter(p => {
                const n   = normalizar(String(p.nombre || '').toLowerCase()).trim();
                const mod = normalizar(String(p.modelo || '').toLowerCase()).trim();
                const ser = normalizar(String(p.serie  || '').toLowerCase()).trim();
                return (n.length   >= 4 && t.includes(n))   ||
                       (mod.length >= 3 && t.includes(mod)) ||
                       (ser.length >= 4 && t.includes(ser));
            });
            if (directos.length) return directos;

            const uno = buscarPatronCalibracion(textoOrden);
            return uno ? [uno] : [];
        }

        /* v2.9.1: tabla con los datos de TODOS los equipos de calibración
           utilizados. Sin distintivo de vigencia: el dato de la vigencia se
           imprime tal cual, con carácter informativo, y la valoración queda a
           criterio de quien revisa el documento.
           Si no hay catálogo o no se reconoce ningún equipo, se imprime el
           texto que venía en la orden más un aviso, en lugar de arriesgar los
           datos de otro equipo. */
        function renderDatosPatron(textoOrden) {
            const detalle = document.getElementById('rutPatronDetalle');
            const aviso = document.getElementById('rutPatronAviso');
            detalle.classList.add('hidden');
            detalle.innerHTML = '';
            aviso.classList.add('hidden');
            aviso.innerText = '';

            if (!catalogoPatrones.length) {
                aviso.innerText = 'Catálogo de equipos de calibración no disponible: no se pudo consultar el certificado ni la vigencia.';
                aviso.classList.remove('hidden');
                return;
            }

            const patrones = buscarPatronesCalibracion(textoOrden);
            if (!patrones.length) {
                aviso.innerText = 'El equipo patrón registrado en la orden no coincide con ningún registro del catálogo "datos equipo de calibracion". Verifique el nombre en la hoja antes de firmar el documento.';
                aviso.classList.remove('hidden');
                return;
            }

            // La columna Laboratorio solo aparece si algún registro la tiene
            const hayLab = patrones.some(p => p.laboratorio);
            const th = 'text-left font-semibold text-slate-600 uppercase text-xs tracking-wider px-2 py-1.5 border border-slate-200';
            const td = 'px-2 py-1.5 border border-slate-200 align-top';

            detalle.innerHTML =
                '<div class="overflow-x-auto">' +
                '<table class="w-full text-xs border-collapse">' +
                    '<thead><tr class="bg-slate-100">' +
                        '<th class="' + th + '">Equipo patrón</th>' +
                        '<th class="' + th + '">Marca</th>' +
                        '<th class="' + th + '">Modelo</th>' +
                        '<th class="' + th + '">No. Serie</th>' +
                        '<th class="' + th + '">No. de certificado</th>' +
                        '<th class="' + th + '">Vigencia de la calibración</th>' +
                        (hayLab ? '<th class="' + th + '">Laboratorio</th>' : '') +
                    '</tr></thead><tbody>' +
                    patrones.map(p =>
                        '<tr>' +
                            '<td class="' + td + ' font-semibold text-slate-900">' + esc(p.nombre) + '</td>' +
                            '<td class="' + td + '">' + esc(p.marca  || '—') + '</td>' +
                            '<td class="' + td + '">' + esc(p.modelo || '—') + '</td>' +
                            '<td class="' + td + ' font-medium">' + esc(p.serie || '—') + '</td>' +
                            '<td class="' + td + ' font-bold text-slate-900">' + esc(p.certificado || 'No registrado') + '</td>' +
                            '<td class="' + td + ' font-bold text-slate-900">' + esc(p.vigenciaStr || 'No registrada') + '</td>' +
                            (hayLab ? '<td class="' + td + '">' + esc(p.laboratorio || '—') + '</td>' : '') +
                        '</tr>').join('') +
                    '</tbody></table></div>' +
                '<p class="text-xs text-slate-400 mt-2 italic">' +
                    patrones.length + ' equipo' + (patrones.length === 1 ? '' : 's') +
                    ' de calibración utilizado' + (patrones.length === 1 ? '' : 's') + ' en este servicio.</p>';
            detalle.classList.remove('hidden');
        }


        /* ============================================================
           SIDEBAR
           ============================================================ */
        function generarSidebarClientes(filtroTexto = '') {
            const container = document.getElementById('listaClientesSidebar');
            container.innerHTML = '';
            const filtroNorm = normalizar(filtroTexto.toLowerCase());
            clientesUnicos
                .filter(c => !filtroNorm || normalizar(c.toLowerCase()).includes(filtroNorm))
                .forEach(cliente => {
                    const btn = document.createElement('button');
                    btn.className = "w-full text-left px-6 py-2.5 text-sm hover:bg-slate-800 hover:text-white transition-colors text-slate-400 truncate";
                    btn.innerText = cliente;
                    btn.title = cliente;
                    btn.onclick = () => { mostrarVistaCliente(cliente); cerrarSidebarMovil(); };
                    container.appendChild(btn);
                });
        }

        function resetSidebarStyles() {
            // v5.4: se limpian TODOS los botones del menú (antes solo el del
            // dashboard, y el último apartado visitado quedaba resaltado) y se
            // oculta la vista de próximos mantenimientos
            ['btnDashboard', 'btnProximos', 'btnCotizador', 'btnCatalogos', 'btnAuditoria', 'btnAdminUsuarios'].forEach(id => {
                const b = document.getElementById(id);
                if (!b) return;
                b.classList.remove('border-brand-500', 'bg-slate-800/50', 'text-white');
                b.classList.add('text-slate-400');
            });
            document.getElementById('btnDashboard').classList.remove('border-l-4');
            const prox = document.getElementById('proximosContent');
            if (prox) prox.classList.add('hidden');

            const btns = document.getElementById('listaClientesSidebar').querySelectorAll('button');
            btns.forEach(b => {
                b.classList.remove('text-brand-400', 'font-bold', 'bg-slate-800/50', 'border-l-4', 'border-brand-500');
                b.classList.add('text-slate-400');
            });
        }

        // MEJORA móvil: abrir/cerrar sidebar
        function toggleSidebar() {
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('sidebarOverlay');
            const abierto = !sb.classList.contains('-translate-x-full');
            if (abierto) { sb.classList.add('-translate-x-full'); ov.classList.add('hidden'); }
            else { sb.classList.remove('-translate-x-full'); ov.classList.remove('hidden'); }
        }
        function cerrarSidebarMovil() {
            if (window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebarOverlay').classList.add('hidden');
            }
        }

        function mostrarDashboard() {
            resetSidebarStyles();
            document.getElementById('btnDashboard').classList.add('border-l-4', 'border-brand-500', 'bg-slate-800/50', 'text-white');
            document.getElementById('btnDashboard').classList.remove('text-slate-400');

            document.getElementById('clienteContent').style.display = 'none';
            document.getElementById('adminUsuariosContent').classList.add('hidden');
            document.getElementById('auditoriaContent').classList.add('hidden');
            document.getElementById('cotizadorContent').classList.add('hidden');
            document.getElementById('catalogosContent').classList.add('hidden');
            document.getElementById('dashboardContent').style.display = 'block';
            cerrarSidebarMovil();
            renderizarDashboard(document.getElementById('monthFilter').value || 'todos');
        }

        /* ============================================================
           VISTA DE CLIENTE
           ============================================================ */

        // MEJORA: elegir el dato de contacto más representativo
        // (el valor más frecuente; en empate, el más completo/largo)
        function mejorValor(valores, invalidos) {
            const conteo = {};
            valores.forEach(v => {
                const s = String(v || '').trim();
                if (!s || invalidos.includes(s)) return;
                conteo[s] = (conteo[s] || 0) + 1;
            });
            const entradas = Object.entries(conteo);
            if (entradas.length === 0) return null;
            entradas.sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length));
            return entradas[0][0];
        }

        function mostrarVistaCliente(clienteNombre) {
            resetSidebarStyles();
            document.getElementById('adminUsuariosContent').classList.add('hidden');
            document.getElementById('auditoriaContent').classList.add('hidden');
            document.getElementById('cotizadorContent').classList.add('hidden');
            document.getElementById('catalogosContent').classList.add('hidden');
            const btns = document.getElementById('listaClientesSidebar').querySelectorAll('button');
            btns.forEach(b => {
                if (b.innerText === clienteNombre) {
                    b.classList.add('text-brand-400', 'font-bold', 'bg-slate-800/50', 'border-l-4', 'border-brand-500');
                    b.classList.remove('text-slate-400');
                }
            });

            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'block';
            clienteActual = clienteNombre;

            document.getElementById('clienteTitulo').innerText = clienteNombre;

            const dataCliente = datosDetalleOrdenes.filter(d => d.Cliente === clienteNombre);

            document.getElementById('clienteDireccion').innerText = mejorValor(dataCliente.map(d => d.Direccion), ['Dirección no registrada']) || 'Dirección no registrada';
            document.getElementById('clienteTelefono').innerText = mejorValor(dataCliente.map(d => d.Telefono), ['Teléfono no registrado']) || 'Teléfono no registrado';
            document.getElementById('clienteCorreo').innerText = mejorValor(dataCliente.map(d => d.Correo), ['Correo no registrado']) || 'Correo no registrado';

            document.getElementById('clienteTotalServicios').innerText = dataCliente.length;

            let ingenieros = {}, tipos = {};
            dataCliente.forEach(d => {
                if (d.Ingeniero && d.Ingeniero !== 'Sin Asignar') ingenieros[d.Ingeniero] = (ingenieros[d.Ingeniero] || 0) + 1;
                if (d['Tipo de Servicio']) tipos[d['Tipo de Servicio']] = (tipos[d['Tipo de Servicio']] || 0) + 1;
            });

            const maxIng = Object.keys(ingenieros).length > 0 ? Object.keys(ingenieros).reduce((a, b) => ingenieros[a] > ingenieros[b] ? a : b) : 'N/A';
            const maxTipo = Object.keys(tipos).length > 0 ? Object.keys(tipos).reduce((a, b) => tipos[a] > tipos[b] ? a : b) : 'N/A';

            const elIng = document.getElementById('clienteIngeniero');
            elIng.innerText = maxIng; elIng.title = maxIng;
            const elTipo = document.getElementById('clienteTipoServicio');
            elTipo.innerText = maxTipo; elTipo.title = maxTipo;

            dataPreventivos   = dataCliente.filter(d => d.esPreventivo);
            dataCalibraciones = dataCliente.filter(d => d.esCalibracion);
            dataCorrectivos   = dataCliente.filter(d => d.esCorrectivo);
            dataEntregas      = dataCliente.filter(d => d.esEntrega);

            /* v3.7: los recuadros de arriba siguen resumiendo por familia
               —programado contra no programado—, aunque las pestañas de abajo
               separen calibraciones y entregas. */
            document.getElementById('clientePrevCount').innerText = dataPreventivos.length + dataCalibraciones.length;
            document.getElementById('clienteCorrCount').innerText = dataCorrectivos.length + dataEntregas.length;

            // v3.7: las cuatro pestañas de servicio se preparan igual
            prepararPestanasServicio();

            // v2.6: preparar pestaña de Comunicación y Seguimiento
            document.getElementById('formCanal').classList.add('hidden');
            document.getElementById('formSeguimiento').classList.add('hidden');
            document.getElementById('filtroSeguimientos').value = 'abiertos';
            renderComunicacion();
            registrarVistaCliente(clienteNombre);

            cambiarPestana('prev');
        }

        /* v3.1 — FILTRO POR AÑO
           Con el histórico creciendo, filtrar solo por mes obliga a revisar
           todos los años a la vez. El año va primero y el selector de mes se
           reconstruye con los meses que existen dentro del año elegido, para
           no ofrecer combinaciones vacías. Los registros sin fecha válida
           quedan agrupados aparte en lugar de desaparecer. */
        function aniosDisponibles(datos) {
            const set = new Set(datos.map(d => d.Anio).filter(a => a && a !== 'sin año'));
            const anios = Array.from(set).sort((a, b) => Number(b) - Number(a));   // más reciente primero
            if (datos.some(d => d.Anio === 'sin año')) anios.push('sin año');
            return anios;
        }

        function poblarSelectAnios(idSelect, datos) {
            const sel = document.getElementById(idSelect);
            if (!sel) return;
            const previo = sel.value;
            sel.innerHTML = '<option value="todos">Todos</option>';
            aniosDisponibles(datos).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.innerText = (a === 'sin año') ? 'Sin fecha' : a;
                sel.appendChild(opt);
            });
            if (previo && Array.from(sel.options).some(o => o.value === previo)) sel.value = previo;
        }

        function poblarSelectMeses(idSelect, datos, anio, etiquetaTodos) {
            const sel = document.getElementById(idSelect);
            if (!sel) return;
            const previo = sel.value;
            sel.innerHTML = '<option value="todos">' + (etiquetaTodos || 'Todos') + '</option>';
            const base = (!anio || anio === 'todos') ? datos : datos.filter(d => d.Anio === anio);
            const meses = [...new Set(base.map(d => d.Mes))].filter(m => m && m !== 'sin mes');
            meses.sort((a, b) => MESES_ES.indexOf(a) - MESES_ES.indexOf(b));
            meses.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.innerText = m.charAt(0).toUpperCase() + m.slice(1);
                sel.appendChild(opt);
            });
            // Si el mes que estaba elegido no existe en el año nuevo, se limpia
            sel.value = Array.from(sel.options).some(o => o.value === previo) ? previo : 'todos';
        }

        // v2.6: pestañas generalizadas (prev / corr / com)
        function cambiarPestana(tab) {
            // v3.7: cuatro pestañas de servicio más la de comunicación
            const defs = {
                prev: ['tabPrev', 'contentPrev'],
                cal:  ['tabCal',  'contentCal'],
                corr: ['tabCorr', 'contentCorr'],
                ent:  ['tabEnt',  'contentEnt'],
                com:  ['tabCom',  'contentCom']
            };
            Object.entries(defs).forEach(([clave, [idBtn, idCont]]) => {
                const btn = document.getElementById(idBtn);
                const cont = document.getElementById(idCont);
                const activo = clave === tab;
                btn.classList.toggle('tab-active', activo);
                btn.classList.toggle('tab-inactive', !activo);
                cont.style.display = activo ? 'block' : 'none';
            });
            if (tab === 'com') renderComunicacion();
        }

        /* ============================================================
           TABLA DE PREVENTIVOS
           ============================================================ */
        /* ============================================================
           v3.7 — LAS CUATRO PESTAÑAS DE SERVICIO

           Preventivos, Calibraciones, Correctivos/Asistencias y
           Entregas/Materiales comparten la misma mecánica, así que comparten
           también el código: una sola definición por pestaña y renderizadores
           genéricos. Las dos primeras llevan columna de próximo servicio y
           botón de rutina; las dos últimas no, porque no son periódicas.
           ============================================================ */
        /* ============================================================
           v3.8 — FACTURACIÓN

           Una factura cubre VARIOS servicios: así se factura en la práctica y
           así lo pide la auditoría financiera. Por eso el registro es la
           factura —número, fecha y las órdenes que cubre— y no una marca
           suelta en cada orden.

           De ahí se sigue una regla que el servidor hace valer: una orden no
           puede quedar en dos facturas. Si al registrar se detecta que alguna
           ya está en otra, se rechaza el guardado señalando en cuál, porque en
           una revisión financiera un servicio cobrado dos veces es justo lo
           que no debe pasar.
           ============================================================ */
        let facturas = [];                       // [{id, numero, fecha, ordenes:[...]}]
        let facturaPorOrden = new Map();         // ID de orden -> factura

        let importePorOrden = new Map();     // v4.1: lo que se facturó por cada orden

        function reconstruirIndiceFacturas() {
            facturaPorOrden = new Map();
            importePorOrden = new Map();
            facturas.forEach(f => {
                const det = (f.detalle && f.detalle.length) ? f.detalle
                                                            : (f.ordenes || []).map(o => ({ id: o, importe: null }));
                det.forEach(o => {
                    const id = String(o.id).trim();
                    facturaPorOrden.set(id, f);
                    importePorOrden.set(id, (o.importe === undefined ? null : o.importe));
                });
            });
        }

        async function cargarFacturas() {
            if (!hayBackend()) { facturas = []; reconstruirIndiceFacturas(); return; }
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ accion: 'listarFacturas', token: tokenSesion() })
                });
                const j = await r.json().catch(() => null);
                facturas = (j && j.ok && Array.isArray(j.facturas)) ? j.facturas : [];
            } catch (_) {
                facturas = [];      // sin señal se muestra sin facturas, no se rompe
            }
            reconstruirIndiceFacturas();
        }

        // Celda de la columna Factura: el folio si ya se facturó, o un guion
        function htmlCeldaFactura(idOrden) {
            const f = facturaPorOrden.get(String(idOrden).trim());
            if (!f) return '<span class="text-slate-300">—</span>';
            return '<button data-factura="' + esc(f.id) + '" class="btn-ver-factura text-left group">' +
                       '<span class="block text-xs font-bold text-green-700 group-hover:underline">' + esc(f.numero) + '</span>' +
                       '<span class="block text-xs text-slate-500">' + esc(fechaCortaFactura(f.fecha)) + '</span>' +
                   '</button>';
        }

        function fechaCortaFactura(iso) {
            if (!iso) return '';
            const d = parsearFechaMantenimiento(iso) || new Date(iso);
            return isNaN(d) ? String(iso) : d.toLocaleDateString('es-MX');
        }

        // Órdenes seleccionadas en la pestaña visible
        function ordenesSeleccionadas(clave) {
            const cont = document.getElementById('content' + PESTANAS_SERVICIO[clave].suf);
            if (!cont) return [];
            return Array.from(cont.querySelectorAll('.chk-orden:checked')).map(x => x.dataset.orden);
        }

        function actualizarBarraFacturacion(clave) {
            const n = ordenesSeleccionadas(clave).length;
            const barra = document.getElementById('barraFactura' + PESTANAS_SERVICIO[clave].suf);
            if (!barra) return;
            barra.classList.toggle('hidden', n === 0);
            const etiqueta = barra.querySelector('.conteo-sel');
            if (etiqueta) etiqueta.innerText = n === 1 ? '1 orden seleccionada' : n + ' órdenes seleccionadas';
        }

        const PESTANAS_SERVICIO = {
            prev: {
                suf: 'Prev', conProximo: true,
                datos: () => dataPreventivos,
                titulo: 'preventivos', archivo: 'Mantenimientos_Preventivos'
            },
            cal: {
                suf: 'Cal', conProximo: true,
                datos: () => dataCalibraciones,
                titulo: 'calibraciones', archivo: 'Calibraciones'
            },
            corr: {
                suf: 'Corr', conProximo: false,
                datos: () => dataCorrectivos,
                titulo: 'correctivos y asistencias', archivo: 'Correctivos_Asistencias'
            },
            ent: {
                suf: 'Ent', conProximo: false,
                datos: () => dataEntregas,
                titulo: 'entregas y materiales', archivo: 'Entregas_Materiales'
            }
        };

        /* ============================================================
           v4.0 — AUDITORÍA FINANCIERA

           El resto de la plataforma mira la operación: qué equipo se atendió y
           cuándo. Esta vista mira el dinero, y por eso invierte el eje: el
           renglón es la FACTURA y debajo cuelgan los servicios que ampara.

           Lleva dos listas porque una auditoría pregunta dos cosas distintas:
             · qué se facturó, con qué respaldo de servicios
             · qué se prestó y todavía NO se ha facturado

           La segunda suele ser la que importa: un servicio ejecutado y no
           cobrado no aparece en ningún lado hasta que alguien lo busca.
           ============================================================ */
        let pestanaAuditoria = 'facturado';
        let auditoriaExpandida = new Set();

        async function mostrarAuditoria() {
            // v4.1: la información financiera es exclusiva del administrador
            if (!esAdministrador()) {
                avisar('La auditoría financiera es exclusiva del administrador.');
                return;
            }
            if (!(await asegurarCredencialAdmin())) return;
            resetSidebarStyles();
            const btn = document.getElementById('btnAuditoria');
            btn.classList.add('border-l-4', 'border-brand-500', 'bg-slate-800/50', 'text-white');
            btn.classList.remove('text-slate-400');
            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'none';
            document.getElementById('adminUsuariosContent').classList.add('hidden');
            document.getElementById('cotizadorContent').classList.add('hidden');
            document.getElementById('catalogosContent').classList.add('hidden');
            document.getElementById('auditoriaContent').classList.remove('hidden');
            cerrarSidebarMovil();
            registrarEvento('ver_auditoria');
            prepararFiltrosAuditoria();
            engancharListenersAuditoria();
            renderAuditoria();
        }

        function prepararFiltrosAuditoria() {
            const selCliente = document.getElementById('audCliente');
            if (selCliente.options.length === 0) {
                selCliente.innerHTML = '<option value="todos">Todas las unidades</option>' +
                    clientesUnicos.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
            }
            const selAnio = document.getElementById('audAnio');
            if (selAnio.options.length === 0) {
                const anios = aniosDisponibles(datosDetalleOrdenes).filter(a => a !== 'sin año');
                selAnio.innerHTML = '<option value="todos">Todos</option>' +
                    (anios.length ? anios : [String(new Date().getFullYear())])
                        .map(a => '<option value="' + a + '">' + a + '</option>').join('');
            }
        }

        function mesesPeriodoAuditoria() {
            const p = document.getElementById('audPeriodo').value;
            if (p === 's1') return [0,1,2,3,4,5];
            if (p === 's2') return [6,7,8,9,10,11];
            return [0,1,2,3,4,5,6,7,8,9,10,11];
        }

        /* v4.1: 'esperado' es lo que el tarifario dice que debería cobrarse.
           Solo existe para preventivos y calibraciones; en correctivos y
           entregas no hay esperado, hay importe capturado. */
        function precioEsperadoDeOrden(d, nivel) {
            if (!tipoConTarifario(d['Tipo de Servicio'])) {
                return { precio: null, moneda: 'MXN', sinTarifa: false, variable: true };
            }
            const t = tarifaDeEquipo(d.Equipo, d['Tipo de Servicio']);
            if (!t) return { precio: null, moneda: 'MXN', sinTarifa: true, variable: false };
            const p = t.precios[nivel];
            return { precio: (p === undefined ? null : p), moneda: t.moneda, sinTarifa: false, variable: false };
        }

        // Nombre anterior, por si queda alguna llamada suelta
        const precioDeOrden = precioEsperadoDeOrden;

        /* Reúne lo que la vista necesita: facturas con sus servicios resueltos
           y los servicios del periodo que no están en ninguna factura. */
        function datosAuditoria() {
            const cliente = document.getElementById('audCliente').value;
            const anio = document.getElementById('audAnio').value;
            const nivel = document.getElementById('audNivel').value;
            const texto = normalizar(document.getElementById('audTexto').value.toLowerCase()).trim();
            const meses = mesesPeriodoAuditoria();

            const enPeriodo = (d) => {
                if (!d.FechaObj) return false;
                if (anio !== 'todos' && String(d.Anio) !== String(anio)) return false;
                return meses.indexOf(d.FechaObj.getUTCMonth()) > -1;
            };
            const deCliente = (c) => cliente === 'todos' || c === cliente;

            // --- Facturas ---
            /* v4.1: el importe de una factura es lo que se capturó al
               registrarla, no una estimación. El tarifario se usa solo para
               contrastar: en preventivos y calibraciones dice cuánto DEBÍA
               facturarse, y la diferencia se señala. En correctivos y entregas
               no hay contra qué contrastar; lo capturado ES el dato. */
            const listaFacturas = facturas.filter(f => deCliente(f.cliente)).map(f => {
                const nivelFactura = f.nivel || nivel;
                const det = (f.detalle && f.detalle.length) ? f.detalle
                                                            : (f.ordenes || []).map(id => ({ id: id, importe: null }));
                const servicios = det.map(o => {
                    const id = String(o.id);
                    const facturado = (o.importe === undefined || o.importe === '') ? null : o.importe;
                    const d = datosDetalleOrdenes.find(x => String(x.ID) === id);
                    if (!d) return { id: id, huerfana: true, precio: facturado, facturado: facturado,
                                     esperado: null, variable: false, sinTarifa: false };
                    const pr = precioEsperadoDeOrden(d, nivelFactura);
                    const dif = (pr.precio !== null && facturado !== null) ? redondear(facturado - pr.precio) : null;
                    return {
                        id: id, equipo: d.Equipo, marca: d.Marca, modelo: d.Modelo, serie: d.Serie,
                        tipo: d['Tipo de Servicio'], fecha: d.FechaEjecucionStr, cliente: d.Cliente,
                        facturado: facturado, precio: facturado,
                        esperado: pr.precio, variable: pr.variable, sinTarifa: pr.sinTarifa,
                        diferencia: dif, huerfana: false
                    };
                });
                const importe = servicios.reduce((a, x) => a + (x.facturado || 0), 0);
                return {
                    ...f, servicios: servicios, importe: importe,
                    sinImporte: servicios.filter(x => x.facturado === null).length,
                    conDiferencia: servicios.filter(x => x.diferencia !== null && x.diferencia !== 0).length,
                    sinTarifa: servicios.filter(x => x.sinTarifa).length,
                    huerfanas: servicios.filter(x => x.huerfana).length
                };
            }).filter(f => {
                // El periodo se mide por la fecha de la factura
                if (anio !== 'todos') {
                    const d = parsearFechaMantenimiento(f.fecha) || new Date(f.fecha);
                    if (isNaN(d)) return false;
                    if (String(d.getUTCFullYear()) !== String(anio)) return false;
                    if (meses.indexOf(d.getUTCMonth()) === -1) return false;
                }
                if (!texto) return true;
                const blob = normalizar((f.numero + ' ' + f.cliente + ' ' +
                              f.servicios.map(x => x.id + ' ' + (x.equipo || '')).join(' ')).toLowerCase());
                return blob.includes(texto);
            }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

            // --- Servicios sin facturar ---
            const pendientes = datosDetalleOrdenes.filter(d =>
                deCliente(d.Cliente) && enPeriodo(d) && !facturaPorOrden.has(String(d.ID).trim())
            ).filter(d => {
                if (!texto) return true;
                const blob = normalizar((d.ID + ' ' + d.Equipo + ' ' + d.Serie + ' ' + d.Cliente).toLowerCase());
                return blob.includes(texto);
            }).map(d => {
                const pr = precioEsperadoDeOrden(d, nivel);
                return {
                    id: d.ID, cliente: d.Cliente, equipo: d.Equipo, marca: d.Marca, modelo: d.Modelo,
                    serie: d.Serie, tipo: d['Tipo de Servicio'], fecha: d.FechaEjecucionStr,
                    fechaObj: d.FechaObj, precio: pr.precio,
                    sinTarifa: pr.sinTarifa, variable: pr.variable
                };
            }).sort((a, b) => (a.fechaObj && b.fechaObj) ? (b.fechaObj - a.fechaObj) : 0);

            const importeFacturado = listaFacturas.reduce((a, f) => a + f.importe, 0);
            const importePendiente = pendientes.reduce((a, x) => a + (x.precio || 0), 0);

            return {
                facturas: listaFacturas, pendientes: pendientes, nivel: nivel,
                importeFacturado: importeFacturado, importePendiente: importePendiente,
                serviciosFacturados: listaFacturas.reduce((a, f) => a + f.servicios.length, 0),
                variables: pendientes.filter(x => x.variable).length,
                sinTarifa: pendientes.filter(x => x.sinTarifa).length +
                           listaFacturas.reduce((a, f) => a + f.sinTarifa, 0),
                conDiferencia: listaFacturas.reduce((a, f) => a + f.conDiferencia, 0),
                sinImporte: listaFacturas.reduce((a, f) => a + f.sinImporte, 0)
            };
        }

        function tarjetaIndicador(titulo, valor, detalle, color) {
            return '<div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">' +
                       '<p class="text-xs font-bold uppercase tracking-wide text-slate-500">' + esc(titulo) + '</p>' +
                       '<p class="text-2xl font-bold mt-1 ' + (color || 'text-slate-900') + '">' + valor + '</p>' +
                       '<p class="text-xs text-slate-500 mt-0.5">' + esc(detalle) + '</p>' +
                   '</div>';
        }

        function renderAuditoria() {
            const a = datosAuditoria();
            const moneda = 'MXN';

            const avisos = [];
            if (a.conDiferencia) avisos.push(a.conDiferencia + ' servicio(s) facturados por un importe distinto al del tarifario');
            if (a.sinImporte) avisos.push(a.sinImporte + ' servicio(s) facturados sin importe capturado');
            const contAvisos = document.getElementById('audAvisos');
            contAvisos.innerHTML = avisos.length
                ? '<div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-xs text-amber-800 font-semibold">' +
                  avisos.map(x => '<p>· ' + esc(x) + '</p>').join('') + '</div>'
                : '';

            document.getElementById('audResumen').innerHTML =
                tarjetaIndicador('Facturas emitidas', a.facturas.length,
                                 a.serviciosFacturados + ' servicio(s) amparados') +
                tarjetaIndicador('Importe facturado', fmtMoneda(a.importeFacturado, moneda),
                                 'Nivel ' + a.nivel, 'text-green-700') +
                tarjetaIndicador('Sin facturar', a.pendientes.length,
                                 'servicios ejecutados y no cobrados', a.pendientes.length ? 'text-amber-600' : 'text-slate-900') +
                tarjetaIndicador('Estimado pendiente', fmtMoneda(a.importePendiente, moneda),
                                 a.variables
                                    ? (a.variables + ' de precio variable, sin estimar')
                                    : 'preventivos y calibraciones, nivel ' + a.nivel,
                                 a.importePendiente ? 'text-amber-600' : 'text-slate-900');

            const badge = document.getElementById('audBadgePend');
            badge.innerText = a.pendientes.length;
            badge.classList.toggle('hidden', a.pendientes.length === 0);

            renderListaFacturasAuditoria(a);
            renderPendientesAuditoria(a);
        }

        function renderListaFacturasAuditoria(a) {
            const cont = document.getElementById('audListaFacturas');
            if (a.facturas.length === 0) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic py-8 text-center">No hay facturas registradas con esos filtros.</p>';
                return;
            }
            cont.innerHTML = a.facturas.map(f => {
                const abierta = auditoriaExpandida.has(f.id);
                const detalle = !abierta ? '' :
                    '<div class="border-t border-slate-200 bg-slate-50">' +
                        '<table class="min-w-full text-xs">' +
                        '<thead><tr class="text-xs uppercase tracking-wide text-slate-500">' +
                            '<th class="px-4 py-2 text-left">Orden</th><th class="px-4 py-2 text-left">Equipo</th>' +
                            '<th class="px-4 py-2 text-left">Serie</th><th class="px-4 py-2 text-left">Servicio</th>' +
                            '<th class="px-4 py-2 text-left">Fecha</th>' +
                            '<th class="px-4 py-2 text-right">Facturado</th>' +
                            '<th class="px-4 py-2 text-right">Tarifario</th>' +
                            '<th class="px-4 py-2 text-right">Diferencia</th>' +
                        '</tr></thead><tbody>' +
                        f.servicios.map(sv => sv.huerfana
                            ? '<tr class="border-t border-slate-200"><td class="px-4 py-2 font-bold">' + esc(sv.id) + '</td>' +
                              '<td colspan="7" class="px-4 py-2 text-red-600 italic">La orden ya no está en el historial descargado</td></tr>'
                            : '<tr class="border-t border-slate-200">' +
                                '<td class="px-4 py-2 font-bold text-slate-700">' + esc(sv.id) + '</td>' +
                                '<td class="px-4 py-2">' + esc(sv.equipo) + '<span class="block text-xs text-slate-500">' + esc(sv.marca + ' / ' + sv.modelo) + '</span></td>' +
                                '<td class="px-4 py-2 text-slate-600">' + esc(sv.serie) + '</td>' +
                                '<td class="px-4 py-2 text-slate-500">' + esc(sv.tipo) + '</td>' +
                                '<td class="px-4 py-2 text-slate-600">' + esc(sv.fecha) + '</td>' +
                                '<td class="px-4 py-2 text-right font-semibold ' + (sv.facturado === null ? 'text-amber-600' : 'text-slate-800') + '">' +
                                    (sv.facturado === null ? 'sin capturar' : fmtMoneda(sv.facturado, 'MXN')) + '</td>' +
                                '<td class="px-4 py-2 text-right text-slate-500">' +
                                    (sv.variable ? '<span class="text-xs uppercase tracking-wide">variable</span>'
                                                 : (sv.sinTarifa ? '<span class="text-amber-600 text-xs uppercase">sin tarifa</span>'
                                                                 : fmtMoneda(sv.esperado, 'MXN'))) + '</td>' +
                                '<td class="px-4 py-2 text-right font-semibold ' +
                                    (sv.diferencia === null ? 'text-slate-300' : (sv.diferencia === 0 ? 'text-green-700' : 'text-amber-700')) + '">' +
                                    (sv.diferencia === null ? '—' : (sv.diferencia === 0 ? 'igual' :
                                        (sv.diferencia > 0 ? '+' : '') + fmtMoneda(sv.diferencia, 'MXN'))) + '</td>' +
                              '</tr>').join('') +
                        '</tbody></table>' +
                    '</div>';

                return '<div class="border border-slate-200 rounded-xl overflow-hidden mb-3 break-inside-avoid">' +
                    '<button data-factura-aud="' + esc(f.id) + '" class="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 hover:bg-slate-50 transition-colors">' +
                        '<span class="font-bold text-slate-900">' + esc(f.numero) + '</span>' +
                        '<span class="text-xs text-slate-500">' + esc(fechaCortaFactura(f.fecha)) + '</span>' +
                        '<span class="text-xs text-slate-700 font-semibold">' + esc(f.cliente || '—') + '</span>' +
                        '<span class="text-xs text-slate-500">' + f.servicios.length + ' servicio(s)</span>' +
                        (f.conDiferencia ? '<span class="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">' + f.conDiferencia + ' con diferencia</span>' : '') +
                        (f.sinImporte ? '<span class="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">' + f.sinImporte + ' sin importe</span>' : '') +
                        (f.huerfanas ? '<span class="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">' + f.huerfanas + ' sin respaldo</span>' : '') +
                        '<span class="ml-auto font-bold text-green-700">' + fmtMoneda(f.importe, 'MXN') + '</span>' +
                        '<span class="text-slate-400 text-xs no-print">' + (abierta ? '▲' : '▼') + '</span>' +
                    '</button>' + detalle +
                '</div>';
            }).join('');
        }

        function renderPendientesAuditoria(a) {
            const cont = document.getElementById('audListaPendientes');
            if (a.pendientes.length === 0) {
                cont.innerHTML = '<p class="text-sm text-green-700 font-semibold py-8 text-center">' +
                                 'Todos los servicios del periodo están facturados.</p>';
                return;
            }
            const th = 'px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider';
            cont.innerHTML =
                '<div class="overflow-x-auto rounded-lg border border-slate-200">' +
                '<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50"><tr>' +
                    '<th class="' + th + '">Orden</th><th class="' + th + '">Unidad</th>' +
                    '<th class="' + th + '">Equipo</th><th class="' + th + '">Serie</th>' +
                    '<th class="' + th + '">Servicio</th><th class="' + th + '">Fecha</th>' +
                    '<th class="' + th + ' text-right">Importe</th>' +
                '</tr></thead><tbody class="divide-y divide-slate-100 bg-white text-sm">' +
                a.pendientes.map(x =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="px-4 py-3 font-bold text-slate-700">' + esc(x.id) + '</td>' +
                        '<td class="px-4 py-3 text-slate-600">' + esc(x.cliente) + '</td>' +
                        '<td class="px-4 py-3">' + esc(x.equipo) +
                            '<span class="block text-xs text-slate-500">' + esc(x.marca + ' / ' + x.modelo) + '</span></td>' +
                        '<td class="px-4 py-3 text-slate-600">' + esc(x.serie) + '</td>' +
                        '<td class="px-4 py-3 text-slate-500 text-xs">' + esc(x.tipo) + '</td>' +
                        '<td class="px-4 py-3 text-slate-600">' + esc(x.fecha) + '</td>' +
                        '<td class="px-4 py-3 text-right font-semibold ' +
                            (x.variable || x.sinTarifa ? 'text-amber-600' : 'text-slate-800') + '">' +
                            (x.variable ? 'precio variable' : (x.sinTarifa ? 'sin tarifa' : fmtMoneda(x.precio, 'MXN'))) + '</td>' +
                    '</tr>').join('') +
                '</tbody></table></div>';
        }

        function cambiarPestanaAuditoria(cual) {
            pestanaAuditoria = cual;
            const esFac = cual === 'facturado';
            document.getElementById('tabAudFac').classList.toggle('tab-active', esFac);
            document.getElementById('tabAudFac').classList.toggle('tab-inactive', !esFac);
            document.getElementById('tabAudPend').classList.toggle('tab-active', !esFac);
            document.getElementById('tabAudPend').classList.toggle('tab-inactive', esFac);
            document.getElementById('audListaFacturas').style.display = esFac ? 'block' : 'none';
            document.getElementById('audListaPendientes').style.display = esFac ? 'none' : 'block';
        }

        /* Los listeners se registran la primera vez que se abre la vista, no al
           cargar el archivo: 'debounce' se declara más abajo y engancharlos
           aquí arriba rompía el script completo por usarla antes de tiempo. */
        let listenersAuditoriaListos = false;

        function engancharListenersAuditoria() {
            if (listenersAuditoriaListos) return;
            listenersAuditoriaListos = true;

            document.getElementById('audListaFacturas').addEventListener('click', (e) => {
                const btn = e.target.closest('[data-factura-aud]');
                if (!btn) return;
                const id = btn.dataset.facturaAud;
                if (auditoriaExpandida.has(id)) auditoriaExpandida.delete(id);
                else auditoriaExpandida.add(id);
                renderAuditoria();
            });

            ['audCliente', 'audAnio', 'audPeriodo', 'audNivel'].forEach(id =>
                document.getElementById(id).addEventListener('change', renderAuditoria));
            document.getElementById('audTexto').addEventListener('input', debounce(renderAuditoria));
        }

        /* ---------- Exportación de la auditoría ---------- */
        function etiquetaPeriodoAuditoria() {
            const anio = document.getElementById('audAnio').value;
            const p = document.getElementById('audPeriodo').value;
            const cliente = document.getElementById('audCliente').value;
            const per = p === 's1' ? 'Enero–Junio' : (p === 's2' ? 'Julio–Diciembre' : 'Todo el año');
            return (cliente === 'todos' ? 'Todas las unidades' : cliente) + ' · ' +
                   (anio === 'todos' ? 'Todos los años' : anio) + ' · ' + per;
        }

        async function exportarAuditoriaExcel() {
            const a = datosAuditoria();
            if (a.facturas.length === 0 && a.pendientes.length === 0) {
                avisar('No hay información que exportar con esos filtros.');
                return;
            }
            try {
                await cargarSheetJS();

                const libro = XLSX.utils.book_new();

                // Hoja 1: una línea por servicio facturado, con su factura
                const f1 = [['Auditoría financiera · servicios facturados'], [etiquetaPeriodoAuditoria()],
                            ['Nivel de precio ' + a.nivel], [],
                            ['Factura', 'Fecha de factura', 'Unidad', 'Orden', 'Equipo', 'Marca', 'Modelo',
                             'No. de serie', 'Tipo de servicio', 'Fecha del servicio',
                             'Facturado', 'Tarifario', 'Diferencia']];
                a.facturas.forEach(f => f.servicios.forEach(sv => {
                    f1.push([f.numero, fechaCortaFactura(f.fecha), f.cliente, sv.id,
                             sv.equipo || '', sv.marca || '', sv.modelo || '', sv.serie || '',
                             sv.tipo || '', sv.fecha || '',
                             (sv.facturado === null ? '' : sv.facturado),
                             (sv.variable ? 'variable' : (sv.esperado === null ? '' : sv.esperado)),
                             (sv.diferencia === null ? '' : sv.diferencia)]);
                }));
                f1.push([]); f1.push(['Importe facturado', a.importeFacturado]);
                const h1 = XLSX.utils.aoa_to_sheet(f1);
                h1['!cols'] = [{wch:14},{wch:14},{wch:26},{wch:12},{wch:28},{wch:14},{wch:14},{wch:18},{wch:24},{wch:14},{wch:14},{wch:14},{wch:14}];
                XLSX.utils.book_append_sheet(libro, h1, 'Facturado');

                // Hoja 2: lo pendiente
                const f2 = [['Auditoría financiera · servicios sin facturar'], [etiquetaPeriodoAuditoria()],
                            ['Nivel de precio ' + a.nivel], [],
                            ['Orden', 'Unidad', 'Equipo', 'Marca', 'Modelo', 'No. de serie',
                             'Tipo de servicio', 'Fecha del servicio', 'Importe estimado']];
                a.pendientes.forEach(x => f2.push([x.id, x.cliente, x.equipo || '', x.marca || '', x.modelo || '',
                                                   x.serie || '', x.tipo || '', x.fecha || '',
                                                   (x.variable ? 'precio variable' : (x.precio === null ? '' : x.precio))]));
                f2.push([]); f2.push(['Importe pendiente', a.importePendiente]);
                const h2 = XLSX.utils.aoa_to_sheet(f2);
                h2['!cols'] = [{wch:12},{wch:26},{wch:28},{wch:14},{wch:14},{wch:18},{wch:24},{wch:14},{wch:16}];
                XLSX.utils.book_append_sheet(libro, h2, 'Sin facturar');

                const limpio = (t) => normalizar(String(t || '')).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
                XLSX.writeFile(libro, 'Auditoria_' + limpio(etiquetaPeriodoAuditoria()) + '.xlsx');
                registrarEvento('exportar_auditoria', 'Excel · ' + etiquetaPeriodoAuditoria());
            } catch (err) {
                avisar(err.message);
            }
        }

        function exportarAuditoriaPDF() {
            registrarEvento('exportar_auditoria', 'PDF · ' + etiquetaPeriodoAuditoria());
            // Se despliegan todas las facturas para que el documento salga completo
            datosAuditoria().facturas.forEach(f => auditoriaExpandida.add(f.id));
            renderAuditoria();
            setTimeout(() => window.print(), 150);
        }

        /* ============================================================
           v3.9 — EXPORTACIÓN DEL CALENDARIO DE SERVICIOS

           Un calendario valorizado: un renglón por servicio y una columna por
           mes del periodo. El precio se coloca EN EL MES en que se realizó el
           servicio, que es lo que permite leer de un vistazo cuánto se generó
           cada mes y contra qué factura salió.

           El periodo va por año calendario: el primer semestre es enero-junio
           y el segundo julio-diciembre.

           El precio sale del tarifario según el nivel elegido, que corresponde
           al convenio del hospital. Un equipo sin tarifa no se omite: aparece
           con el precio en blanco, porque esconderlo daría un total que parece
           completo sin serlo.
           ============================================================ */
        const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                              'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        let claveTabExportar = 'prev';

        function mesesDelPeriodo() {
            const periodo = document.getElementById('expPeriodo').value;
            const rango = document.getElementById('expRango').value;
            if (periodo === 'anual') return [0,1,2,3,4,5,6,7,8,9,10,11];
            if (periodo === 'semestral') return (rango === '2') ? [6,7,8,9,10,11] : [0,1,2,3,4,5];
            const m = parseInt(rango, 10);
            return [Number.isFinite(m) ? m : new Date().getMonth()];
        }

        function etiquetaPeriodo() {
            const periodo = document.getElementById('expPeriodo').value;
            const anio = document.getElementById('expAnio').value;
            const meses = mesesDelPeriodo();
            if (periodo === 'anual') return 'Año ' + anio;
            if (periodo === 'semestral') {
                return (meses[0] === 0 ? 'Primer' : 'Segundo') + ' semestre ' + anio +
                       ' (' + MESES_CORTOS[meses[0]] + '–' + MESES_CORTOS[meses[meses.length - 1]] + ')';
            }
            return MESES_CORTOS[meses[0]] + ' ' + anio;
        }

        function poblarRangoExportar() {
            const periodo = document.getElementById('expPeriodo').value;
            const sel = document.getElementById('expRango');
            if (periodo === 'anual') {
                sel.innerHTML = '<option value="">Todo el año</option>';
                sel.disabled = true;
            } else if (periodo === 'semestral') {
                sel.innerHTML = '<option value="1">Enero – Junio</option><option value="2">Julio – Diciembre</option>';
                sel.disabled = false;
            } else {
                sel.innerHTML = MESES_CORTOS.map((m, i) =>
                    '<option value="' + i + '">' + MESES_ES[i].charAt(0).toUpperCase() + MESES_ES[i].slice(1) + '</option>').join('');
                sel.value = String(new Date().getMonth());
                sel.disabled = false;
            }
        }

        /* v5.1 — PRÓXIMOS MANTENIMIENTOS
           El calendario ya no lista lo que se hizo, sino lo que TOCA hacer.

           1. Se agrupan las órdenes por equipo (número de serie; si no hay, el
              inventario; si tampoco, equipo + marca + modelo + área) y por tipo
              (preventivo o calibración, que llevan calendarios distintos).
           2. De cada grupo solo cuenta el ÚLTIMO servicio. Si se usaran todas
              las órdenes, un equipo atendido en enero y en julio proyectaría
              otra vez julio, que ya se hizo.
           3. A partir de esa fecha se repite la frecuencia del equipo
              (FRECUENCIAS_MESES) y se colocan en el periodo las fechas que caen
              dentro: un equipo semestral aparece dos veces en el año.
           4. Si el primer próximo mantenimiento ya pasó y no hay un servicio
              posterior, el equipo se marca como VENCIDO. */
        const ESTADO_VENCIDO = 'Vencido', ESTADO_PROGRAMADO = 'Programado';

        function sumarMesesUTC(fecha, meses) {
            const d = new Date(fecha);
            d.setUTCMonth(d.getUTCMonth() + meses);   // mismo cálculo que la columna "Próximo servicio"
            return d;
        }

        function fechaCortaCal(d) {
            return d ? d.toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
        }

        function llaveEquipoCal(d) {
            const limpio = (v) => {
                const t = normalizar(String(v || '').toLowerCase()).replace(/\s+/g, '').trim();
                return ['', 'n/a', 'na', 's/n', 'sn', 'sinserie', 'nd', 'n/d', '-', '0'].indexOf(t) > -1 ? '' : t;
            };
            const serie = limpio(d.Serie), inv = limpio(d.Inventario);
            if (serie) return 's:' + serie;
            if (inv) return 'i:' + inv;
            return 'e:' + [d.Equipo, d.Marca, d.Modelo, d.Area].map(x => normalizar(String(x || '').toLowerCase()).trim()).join('|');
        }

        // Último servicio de cada equipo, por tipo
        function ultimosServiciosPorEquipo() {
            const tipo = document.getElementById('expTipo').value;
            const fuentes = [];
            if (tipo === 'prev' || tipo === 'ambos') fuentes.push({ tipo: 'Preventivo', datos: dataPreventivos });
            if (tipo === 'cal' || tipo === 'ambos')  fuentes.push({ tipo: 'Calibración', datos: dataCalibraciones });

            const ultimos = new Map();
            fuentes.forEach(f => f.datos.forEach(d => {
                if (!d.FechaObj) return;
                const llave = f.tipo + '#' + llaveEquipoCal(d);
                const previo = ultimos.get(llave);
                if (!previo || d.FechaObj > previo.orden.FechaObj) ultimos.set(llave, { tipo: f.tipo, orden: d });
            }));
            return Array.from(ultimos.values());
        }

        function construirCalendario() {
            const nivel = document.getElementById('expNivel').value;
            const anio = parseInt(document.getElementById('expAnio').value, 10);
            const meses = mesesDelPeriodo();
            const inicio = new Date(Date.UTC(anio, meses[0], 1));
            const fin = new Date(Date.UTC(anio, meses[meses.length - 1] + 1, 1));   // exclusivo
            const hoy = new Date(); const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

            const filas = [];
            ultimosServiciosPorEquipo().forEach(({ tipo, orden: d }) => {
                const frec = frecuenciaParaEquipo(d.Equipo);
                if (!(frec > 0)) return;
                const primero = sumarMesesUTC(d.FechaObj, frec);

                const fechas = [];
                for (let k = 1; k <= 240; k++) {
                    const f = sumarMesesUTC(d.FechaObj, frec * k);
                    if (f >= fin) break;
                    if (f >= inicio) fechas.push(f);
                }
                if (!fechas.length) return;

                const tarifa = tarifaDeEquipo(d.Equipo, tipo);
                const precio = tarifa ? tarifa.precios[nivel] : null;
                const vencido = primero < hoyUTC;
                filas.push({
                    equipo: d.Equipo || '', marca: d.Marca || '', modelo: d.Modelo || '',
                    serie: d.Serie || '', inventario: d.Inventario || '', area: d.Area || '',
                    tipoServicio: tipo,
                    ultimaFecha: fechaCortaCal(d.FechaObj), ultimaOrden: d.ID || '',
                    frecuencia: frec,
                    fechas: fechas,
                    fechasStr: fechas.map(fechaCortaCal).join(', '),
                    mesesProgramados: fechas.map(f => f.getUTCMonth()),
                    estado: vencido ? ESTADO_VENCIDO : ESTADO_PROGRAMADO,
                    vencidoDesde: vencido ? fechaCortaCal(primero) : '',
                    precio: (precio === undefined ? null : precio),
                    moneda: tarifa ? tarifa.moneda : 'MXN',
                    sinTarifa: !tarifa
                });
            });
            filas.sort((x, y) => (x.fechas[0] - y.fechas[0]) || x.equipo.localeCompare(y.equipo, 'es'));

            const totales = {};
            meses.forEach(m => { totales[m] = 0; });
            let total = 0, sinTarifa = 0, eventos = 0, vencidos = 0;
            filas.forEach(r => {
                eventos += r.fechas.length;
                if (r.estado === ESTADO_VENCIDO) vencidos++;
                if (r.precio === null) { if (r.sinTarifa) sinTarifa++; return; }
                r.mesesProgramados.forEach(m => { totales[m] = (totales[m] || 0) + r.precio; total += r.precio; });
            });

            return { filas, meses, totales, total, sinTarifa, nivel, eventos, vencidos };
        }

        function actualizarResumenExportar() {
            const cal = construirCalendario();
            const cont = document.getElementById('expResumen');
            const moneda = (cal.filas[0] && cal.filas[0].moneda) || 'MXN';
            if (cal.filas.length === 0) {
                cont.innerHTML = '<span class="font-semibold text-slate-700">Sin mantenimientos programados en ese periodo.</span> ' +
                                 'Cambia el año, el periodo o el tipo de servicio.';
                return;
            }
            cont.innerHTML =
                '<span class="font-semibold text-slate-700">' + cal.filas.length + ' equipo(s) · ' +
                cal.eventos + ' mantenimiento(s) programado(s)</span> · ' +
                etiquetaPeriodo() + ' · importe estimado ' + fmtMoneda(cal.total, moneda) +
                (cal.vencidos
                    ? '<br><span class="text-red-700 font-semibold">' + cal.vencidos +
                      ' equipo(s) con su próximo mantenimiento ya vencido y sin servicio posterior.</span>'
                    : '') +
                (cal.sinTarifa
                    ? '<br><span class="text-amber-700 font-semibold">' + cal.sinTarifa +
                      ' equipo(s) sin tarifa en el tarifario: saldrán con el precio en blanco y no suman al total.</span>'
                    : '');
        }

        function abrirModalExportar(clave) {
            claveTabExportar = clave;
            document.getElementById('expTipo').value = (clave === 'prev' || clave === 'cal') ? clave : 'ambos';
            document.getElementById('expSubtitulo').innerText =
                clienteActual + ' · el precio se coloca en el mes en que vence cada mantenimiento';

            // Años: el anterior (para revisar lo que quedó vencido) y los dos siguientes
            const actual = new Date().getFullYear();
            const selAnio = document.getElementById('expAnio');
            selAnio.innerHTML = [actual - 1, actual, actual + 1, actual + 2]
                .map(a => '<option value="' + a + '">' + a + '</option>').join('');
            selAnio.value = String(actual);

            document.getElementById('expPeriodo').value = 'anual';
            poblarRangoExportar();
            document.getElementById('expMensaje').classList.add('hidden');
            actualizarResumenExportar();

            const m = document.getElementById('modalExportar');
            m.classList.remove('hidden'); m.classList.add('flex');
        }

        function cerrarModalExportar() {
            const m = document.getElementById('modalExportar');
            m.classList.add('hidden'); m.classList.remove('flex');
        }

        ['expPeriodo', 'expAnio', 'expRango', 'expTipo', 'expNivel'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                if (id === 'expPeriodo') poblarRangoExportar();
                actualizarResumenExportar();
            });
        });

        function mensajeExportarUI(texto, tipo) {
            const el = document.getElementById('expMensaje');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-700 border border-green-200',
                info:  'bg-slate-100 text-slate-600 border border-slate-200'
            };
            el.className = 'text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        const ENCABEZADOS_CALENDARIO = ['Equipo', 'Marca', 'Modelo', 'No. de serie', 'Inventario', 'Área',
                                        'Tipo de servicio', 'Último servicio', 'Orden del último servicio',
                                        'Frecuencia (meses)', 'Próximo(s) mantenimiento(s)', 'Estado'];
        const valoresBaseCalendario = (r) => [r.equipo, r.marca, r.modelo, r.serie, r.inventario, r.area,
            r.tipoServicio, r.ultimaFecha, r.ultimaOrden, r.frecuencia, r.fechasStr,
            r.estado + (r.vencidoDesde ? ' desde ' + r.vencidoDesde : '')];

        function nombreArchivoCalendario(ext) {
            const limpio = (t) => normalizar(String(t || '')).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
            return 'Proximos_mantenimientos_' + limpio(clienteActual) + '_' + limpio(etiquetaPeriodo()) +
                   '_Nivel_' + document.getElementById('expNivel').value + '.' + ext;
        }

        /* ---------- Exportación a Excel ----------
           SheetJS se carga solo cuando se exporta: no tiene sentido pesarle la
           descarga a quien nunca usa esta pantalla. */
        function cargarSheetJS() {
            if (window.XLSX) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                s.onload = () => resolve();
                s.onerror = () => reject(new Error('No se pudo cargar la librería de Excel. Revisa tu conexión e inténtalo de nuevo.'));
                document.head.appendChild(s);
            });
        }

        async function exportarCalendarioExcel() {
            const cal = construirCalendario();
            if (cal.filas.length === 0) { mensajeExportarUI('No hay mantenimientos programados en ese periodo.', 'error'); return; }

            const btn = document.getElementById('btnExportarExcel');
            btn.disabled = true; btn.innerText = 'Generando…';
            try {
                await cargarSheetJS();

                const encabezadoMeses = cal.meses.map(m => MESES_CORTOS[m]);
                const aoa = [];
                aoa.push(['Calendario de próximos mantenimientos']);
                aoa.push([clienteActual]);
                aoa.push([etiquetaPeriodo() + '  ·  Nivel de precio ' + cal.nivel]);
                aoa.push([]);
                aoa.push(ENCABEZADOS_CALENDARIO.concat(encabezadoMeses));

                cal.filas.forEach(r => {
                    const celdasMes = cal.meses.map(m => r.mesesProgramados.indexOf(m) === -1 ? ''
                                                         : (r.precio !== null ? r.precio : 'sin tarifa'));
                    aoa.push(valoresBaseCalendario(r).concat(celdasMes));
                });

                aoa.push([]);
                aoa.push(['Total'].concat(new Array(ENCABEZADOS_CALENDARIO.length - 1).fill(''))
                           .concat(cal.meses.map(m => cal.totales[m] || 0)));
                aoa.push(['Importe del periodo', cal.total]);
                if (cal.sinTarifa) {
                    aoa.push([cal.sinTarifa + ' equipo(s) sin tarifa en el tarifario; su precio quedó en blanco y no suma al total.']);
                }
                if (cal.vencidos) {
                    aoa.push([cal.vencidos + ' equipo(s) con el próximo mantenimiento vencido y sin servicio posterior.']);
                }

                const hoja = XLSX.utils.aoa_to_sheet(aoa);
                hoja['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 18 },
                                 { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 22 }]
                                 .concat(cal.meses.map(() => ({ wch: 12 })));
                const libro = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(libro, hoja, 'Proximos mantenimientos');
                XLSX.writeFile(libro, nombreArchivoCalendario('xlsx'));

                registrarEvento('exportar_calendario', 'Excel · próximos · ' + etiquetaPeriodo() + ' · nivel ' + cal.nivel +
                                                        ' · ' + cal.filas.length + ' equipo(s)');
                mensajeExportarUI('Archivo generado.', 'ok');
            } catch (err) {
                mensajeExportarUI(err.message, 'error');
            } finally {
                btn.disabled = false; btn.innerText = 'Exportar a Excel';
            }
        }

        /* ---------- Exportación a PDF ----------
           Se arma el calendario en una hoja aparte y se manda a imprimir: en el
           diálogo del navegador se elige "Guardar como PDF". Es el mismo camino
           que ya usa la rutina, y evita cargar otra librería. */
        /* v5.2 — El PDF ya no se corta. Antes llevaba 12 columnas de datos más
           una por mes (24 en el anual) con importes de dos decimales: no cabía
           en una hoja carta horizontal y los últimos meses quedaban fuera.
           Ahora:
             · los datos del equipo se agrupan en tres columnas (equipo con
               marca, modelo, serie, inventario y área; último servicio; estado)
             · la tabla usa anchos fijos repartidos sobre el ancho útil de la
               hoja, y el texto largo se ajusta en renglones en lugar de empujar
             · los importes de los meses van sin centavos y en letra más chica
           El Excel conserva todas las columnas por separado. */
        function exportarCalendarioPDF() {
            const cal = construirCalendario();
            if (cal.filas.length === 0) { mensajeExportarUI('No hay mantenimientos programados en ese periodo.', 'error'); return; }

            const moneda = (cal.filas[0] && cal.filas[0].moneda) || 'MXN';
            const entero = (v) => '$' + Math.round(Number(v) || 0).toLocaleString('es-MX');
            const nMeses = cal.meses.length;

            // Ancho útil de carta horizontal: 279.4 − 10 − 10 = 259 mm
            const ANCHO = 259;
            const colEquipo = nMeses > 6 ? 62 : 95, colUltimo = 21, colFrec = 9, colEstado = 19;
            const colMes = ((ANCHO - colEquipo - colUltimo - colFrec - colEstado) / nMeses).toFixed(2);
            const fMes = nMeses > 6 ? '6.5pt' : '8pt', fTot = nMeses > 6 ? '6pt' : '7.5pt';

            const th = 'background:#005DA1;color:#fff;font-size:7.5pt;font-weight:700;padding:1.2mm 1.2mm;' +
                       'border:0.2mm solid #005DA1;text-align:left;vertical-align:bottom;';
            const td = 'font-size:7.5pt;padding:1.2mm;border:0.2mm solid #cbd5e1;vertical-align:top;overflow-wrap:anywhere;';

            let html =
                '<div style="font-family:Inter,Arial,sans-serif;color:#0f172a;width:' + ANCHO + 'mm;' +
                '-webkit-print-color-adjust:exact;print-color-adjust:exact">' +
                '<h1 style="font-size:14pt;margin:0 0 1.5mm">Calendario de próximos mantenimientos</h1>' +
                '<p style="font-size:10pt;margin:0 0 1mm;font-weight:700">' + esc(clienteActual) + '</p>' +
                '<p style="font-size:8.5pt;margin:0 0 3mm;color:#475569">' + esc(etiquetaPeriodo()) +
                '  ·  Nivel de precio ' + esc(cal.nivel) +
                '  ·  ' + cal.filas.length + ' equipo(s)  ·  ' + cal.eventos + ' mantenimiento(s) programado(s)' +
                (cal.vencidos ? '  ·  <span style="color:#b91c1c;font-weight:700">' + cal.vencidos + ' vencido(s)</span>' : '') + '</p>' +
                '<table style="width:' + ANCHO + 'mm;table-layout:fixed;border-collapse:collapse">' +
                '<colgroup><col style="width:' + colEquipo + 'mm"><col style="width:' + colUltimo + 'mm">' +
                '<col style="width:' + colFrec + 'mm"><col style="width:' + colEstado + 'mm">' +
                cal.meses.map(() => '<col style="width:' + colMes + 'mm">').join('') + '</colgroup>' +
                '<thead><tr>' +
                '<th style="' + th + '">Equipo</th><th style="' + th + '">Último servicio</th>' +
                '<th style="' + th + 'text-align:center">Frec. (m)</th><th style="' + th + '">Estado</th>' +
                cal.meses.map(m => '<th style="' + th + 'text-align:center">' + MESES_CORTOS[m] + '</th>').join('') +
                '</tr></thead><tbody>';

            cal.filas.forEach(r => {
                const vencido = r.estado === ESTADO_VENCIDO;
                const detalle = [[r.marca, r.modelo].filter(Boolean).join(' · '),
                                 [r.serie ? 'S/N ' + r.serie : '', r.inventario ? 'Inv. ' + r.inventario : ''].filter(Boolean).join(' · '),
                                 [r.area, r.tipoServicio].filter(Boolean).join(' · ')].filter(Boolean);
                html += '<tr style="break-inside:avoid;page-break-inside:avoid">' +
                    '<td style="' + td + '"><b>' + esc(r.equipo) + '</b>' +
                        detalle.map(t => '<br><span style="color:#475569;font-size:6.8pt">' + esc(t) + '</span>').join('') + '</td>' +
                    '<td style="' + td + '">' + esc(r.ultimaFecha) +
                        (r.ultimaOrden ? '<br><span style="color:#475569;font-size:6.8pt">Orden ' + esc(r.ultimaOrden) + '</span>' : '') + '</td>' +
                    '<td style="' + td + 'text-align:center">' + esc(r.frecuencia) + '</td>' +
                    '<td style="' + td + (vencido ? 'color:#b91c1c;font-weight:700;' : '') + '">' + esc(r.estado) +
                        (r.vencidoDesde ? '<br><span style="font-size:6.8pt;font-weight:400">desde ' + esc(r.vencidoDesde) + '</span>' : '') + '</td>' +
                    cal.meses.map(m => {
                        const toca = r.mesesProgramados.indexOf(m) > -1;
                        return '<td style="' + td + 'padding:1.2mm 0.6mm;text-align:center;white-space:nowrap;font-size:' + fMes + ';' +
                            (toca ? 'font-weight:700;background:' + (vencido ? '#fee2e2' : '#e0f2fe') + ';' : '') + '">' +
                            (toca ? (r.precio === null ? 'S/T' : entero(r.precio)) : '') + '</td>';
                    }).join('') +
                '</tr>';
            });

            // El total va como último renglón del cuerpo, no en <tfoot>: Chrome
            // repite el tfoot en cada hoja y parecería un total parcial.
            html += '<tr style="break-inside:avoid">' +
                '<td colspan="4" style="' + td + 'font-weight:700;background:#f1f5f9;text-align:right">Total por mes</td>' +
                cal.meses.map(m => '<td style="' + td + 'padding:1.2mm 0.4mm;text-align:center;white-space:nowrap;font-size:' + fTot +
                                   ';font-weight:700;background:#f1f5f9">' + entero(cal.totales[m] || 0) + '</td>').join('') +
                '</tr></tbody></table>' +
                '<p style="font-size:10pt;margin:3mm 0 0;text-align:right;font-weight:700">Importe estimado del periodo: ' +
                fmtMoneda(cal.total, moneda) + '</p>' +
                '<p style="font-size:7pt;color:#475569;margin-top:1.5mm">Importes por mes redondeados a pesos. ' +
                '<b>S/T</b>: equipo sin tarifa en el tarifario (no suma al importe). Azul: programado · Rojo: vencido.</p>' +
                (cal.sinTarifa
                    ? '<p style="font-size:7.5pt;color:#92400e;margin-top:1mm">' + cal.sinTarifa +
                      ' equipo(s) sin tarifa en el tarifario.</p>'
                    : '') +
                '</div>';

            const cont = document.getElementById('calendarioImprimible');
            cont.innerHTML = html;
            cont.classList.remove('hidden');
            document.body.classList.add('printing-calendario');

            registrarEvento('exportar_calendario', 'PDF · próximos · ' + etiquetaPeriodo() + ' · nivel ' + cal.nivel +
                                                    ' · ' + cal.filas.length + ' equipo(s)');

            const limpiar = () => {
                document.body.classList.remove('printing-calendario');
                cont.classList.add('hidden');
                cont.innerHTML = '';
                window.removeEventListener('afterprint', limpiar);
            };
            window.addEventListener('afterprint', limpiar);
            setTimeout(() => window.print(), 120);
        }


        /* ============================================================
           v5.4 — PRÓXIMOS MANTENIMIENTOS DE TODAS LAS UNIDADES
           Misma regla que el calendario exportable (v5.1), pero sobre todas
           las unidades a la vez: por equipo y por tipo cuenta solo el último
           servicio; el próximo es ese servicio más la frecuencia del equipo.
           Si ya pasó, el equipo está vencido.
           ============================================================ */
        const DIA_MS = 86400000;

        function hoyUTC() {
            const h = new Date();
            return new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()));
        }

        function calcularProximosGlobal() {
            const ultimos = new Map();
            datosDetalleOrdenes.forEach(d => {
                if (!d.FechaObj || !(d.esPreventivo || d.esCalibracion)) return;
                const tipo = d.esCalibracion ? 'Calibración' : 'Preventivo';
                const llave = d.Cliente + '#' + tipo + '#' + llaveEquipoCal(d);
                const previo = ultimos.get(llave);
                if (!previo || d.FechaObj > previo.orden.FechaObj) ultimos.set(llave, { tipo: tipo, orden: d });
            });
            const hoy = hoyUTC();
            const lista = [];
            ultimos.forEach(({ tipo, orden: d }) => {
                const frec = frecuenciaParaEquipo(d.Equipo);
                if (!(frec > 0)) return;
                const fecha = sumarMesesUTC(d.FechaObj, frec);
                lista.push({
                    unidad: d.Cliente || '', tipo: tipo,
                    equipo: d.Equipo || '', marca: d.Marca || '', modelo: d.Modelo || '',
                    serie: d.Serie || '', inventario: d.Inventario || '', area: d.Area || '',
                    ultimaFecha: d.FechaObj, ultimaOrden: d.ID || '', ingeniero: d.Ingeniero || '',
                    frecuencia: frec, fecha: fecha,
                    dias: Math.round((fecha - hoy) / DIA_MS)
                });
            });
            return lista.sort((a, b) => (a.fecha - b.fecha) || a.unidad.localeCompare(b.unidad, 'es'));
        }

        let proximosCache = [];

        function actualizarBadgeProximos() {
            proximosCache = calcularProximosGlobal();
            const vencidos = proximosCache.filter(x => x.dias < 0).length;
            const b = document.getElementById('badgeProximos');
            if (!b) return;
            b.innerText = vencidos > 99 ? '99+' : String(vencidos);
            b.classList.toggle('hidden', vencidos === 0);
        }

        function poblarFiltrosProximos() {
            const unidades = Array.from(new Set(proximosCache.map(x => x.unidad))).sort((a, b) => a.localeCompare(b, 'es'));
            const ings = Array.from(new Set(proximosCache.map(x => x.ingeniero).filter(i => i && i !== 'Sin Asignar')))
                              .sort((a, b) => a.localeCompare(b, 'es'));
            const selU = document.getElementById('proxUnidad'), selI = document.getElementById('proxIngeniero');
            const pu = selU.value, pi = selI.value;
            selU.innerHTML = '<option value="">Todas las unidades</option>' +
                unidades.map(u => '<option value="' + esc(u) + '">' + esc(u) + '</option>').join('');
            selI.innerHTML = '<option value="">Todos los ingenieros</option>' +
                ings.map(i => '<option value="' + esc(i) + '">' + esc(i) + '</option>').join('');
            if (unidades.includes(pu)) selU.value = pu;
            if (ings.includes(pi)) selI.value = pi;
        }

        function proximosFiltrados() {
            const ventana = document.getElementById('proxVentana').value;
            const unidad = document.getElementById('proxUnidad').value;
            const tipo = document.getElementById('proxTipo').value;
            const ing = document.getElementById('proxIngeniero').value;
            const q = normalizar(document.getElementById('proxBuscar').value.trim().toLowerCase());
            return proximosCache.filter(x => {
                if (ventana === 'vencidos' && x.dias >= 0) return false;
                if (ventana !== 'vencidos' && ventana !== 'todos' && x.dias > parseInt(ventana, 10)) return false;
                if (unidad && x.unidad !== unidad) return false;
                if (tipo === 'prev' && x.tipo !== 'Preventivo') return false;
                if (tipo === 'cal' && x.tipo !== 'Calibración') return false;
                if (ing && x.ingeniero !== ing) return false;
                if (q) {
                    const blob = normalizar([x.equipo, x.marca, x.modelo, x.serie, x.inventario, x.area, x.unidad].join(' ').toLowerCase());
                    if (!blob.includes(q)) return false;
                }
                return true;
            });
        }

        function textoSituacion(dias) {
            if (dias < 0) return 'Vencido hace ' + (-dias) + (dias === -1 ? ' día' : ' días');
            if (dias === 0) return 'Hoy';
            return 'En ' + dias + (dias === 1 ? ' día' : ' días');
        }

        function renderProximos() {
            const todos = proximosCache;
            document.getElementById('proxKpiVencidos').innerText = todos.filter(x => x.dias < 0).length;
            document.getElementById('proxKpi7').innerText = todos.filter(x => x.dias >= 0 && x.dias <= 7).length;
            document.getElementById('proxKpi30').innerText = todos.filter(x => x.dias >= 0 && x.dias <= 30).length;
            document.getElementById('proxKpiTotal').innerText = todos.length;

            const lista = proximosFiltrados();
            const vencidos = lista.filter(x => x.dias < 0).length;
            document.getElementById('proxResumen').innerText = lista.length + ' equipo(s)' +
                (vencidos ? ' · ' + vencidos + ' vencido(s)' : '') + ' · ordenados por fecha programada';

            const tbody = document.getElementById('proxTabla');
            if (!lista.length) {
                tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-500">' +
                    (todos.length ? 'Ningún equipo cumple con los filtros.' : 'No hay preventivos ni calibraciones registrados.') + '</td></tr>';
                return;
            }
            tbody.innerHTML = lista.slice(0, 1500).map(x => {
                const venc = x.dias < 0, pronto = x.dias >= 0 && x.dias <= 7;
                const etiqueta = venc ? 'bg-red-100 text-red-700' : (pronto ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600');
                const icono = venc ? '⚠ ' : '';
                const detalle = [[x.marca, x.modelo].filter(Boolean).join(' · '),
                                 [x.serie ? 'S/N ' + x.serie : '', x.inventario ? 'Inv. ' + x.inventario : ''].filter(Boolean).join(' · ')]
                                 .filter(Boolean).join('<br>');
                const pest = x.tipo === 'Calibración' ? 'cal' : 'prev';
                return '<tr class="hover:bg-slate-50 align-top">' +
                    '<td class="px-4 py-3 whitespace-nowrap"><p class="text-sm font-semibold text-slate-800">' + esc(fechaCortaCal(x.fecha)) + '</p>' +
                        '<span class="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ' + etiqueta + '">' + icono + esc(textoSituacion(x.dias)) + '</span></td>' +
                    '<td class="px-4 py-3 text-sm"><a href="' + esc(hashUnidad(x.unidad, pest)) + '" onclick="return irAUnidad(this.dataset.u, this.dataset.t)" ' +
                        'data-u="' + esc(x.unidad) + '" data-t="' + pest + '" class="text-brand-600 hover:text-brand-800 font-semibold hover:underline">' + esc(x.unidad) + '</a></td>' +
                    '<td class="px-4 py-3 text-sm"><p class="font-semibold text-slate-800">' + esc(x.equipo) + '</p>' +
                        '<p class="text-xs text-slate-500 mt-0.5">' + esc(x.tipo) + ' · cada ' + x.frecuencia + ' meses</p>' +
                        (detalle ? '<p class="text-xs text-slate-500 mt-0.5">' + detalle.split('<br>').map(esc).join('<br>') + '</p>' : '') + '</td>' +
                    '<td class="px-4 py-3 text-sm text-slate-600">' + esc(x.area) + '</td>' +
                    '<td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">' + esc(fechaCortaCal(x.ultimaFecha)) +
                        (x.ultimaOrden ? '<p class="text-xs text-slate-500">Orden ' + esc(x.ultimaOrden) + '</p>' : '') + '</td>' +
                    '<td class="px-4 py-3 text-sm text-slate-600">' + esc(x.ingeniero) + '</td>' +
                '</tr>';
            }).join('') + (lista.length > 1500 ? '<tr><td colspan="6" class="px-4 py-3 text-xs text-slate-500">Se muestran los primeros 1500. Usa los filtros o exporta a Excel para ver todos.</td></tr>' : '');
        }

        function mostrarProximos() {
            resetSidebarStyles();
            const btn = document.getElementById('btnProximos');
            btn.classList.add('border-brand-500', 'bg-slate-800/50', 'text-white');
            btn.classList.remove('text-slate-400');
            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'none';
            ['adminUsuariosContent', 'auditoriaContent', 'cotizadorContent', 'catalogosContent']
                .forEach(id => document.getElementById(id).classList.add('hidden'));
            document.getElementById('proximosContent').classList.remove('hidden');
            cerrarSidebarMovil();
            actualizarBadgeProximos();
            poblarFiltrosProximos();
            renderProximos();
            registrarEvento('ver_proximos');
        }

        function filtroRapidoProximos(v) {
            document.getElementById('proxVentana').value = v;
            renderProximos();
        }

        ['proxVentana', 'proxUnidad', 'proxTipo', 'proxIngeniero'].forEach(id =>
            document.getElementById(id).addEventListener('change', renderProximos));
        document.getElementById('proxBuscar').addEventListener('input', renderProximos);

        async function exportarProximosExcel() {
            const lista = proximosFiltrados();
            if (!lista.length) { avisar('No hay equipos con los filtros actuales.'); return; }
            try {
                await cargarSheetJS();
                const hoy = new Date().toISOString().slice(0, 10);
                const aoa = [['Próximos mantenimientos · Ingenieros Asociados'],
                             ['Generado el ' + hoy + ' · ' + lista.length + ' equipo(s)'], [],
                             ['Fecha programada', 'Situación', 'Unidad', 'Tipo', 'Equipo', 'Marca', 'Modelo', 'No. de serie',
                              'Inventario', 'Área', 'Frecuencia (meses)', 'Último servicio', 'Orden del último servicio', 'Atendió']]
                    .concat(lista.map(x => [fechaCortaCal(x.fecha), textoSituacion(x.dias), x.unidad, x.tipo, x.equipo, x.marca,
                                            x.modelo, x.serie, x.inventario, x.area, x.frecuencia, fechaCortaCal(x.ultimaFecha),
                                            x.ultimaOrden, x.ingeniero]));
                const hoja = XLSX.utils.aoa_to_sheet(aoa);
                hoja['!cols'] = [14, 20, 30, 12, 30, 16, 16, 18, 14, 22, 10, 14, 12, 24].map(w => ({ wch: w }));
                hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + lista.length, c: 13 } }) };
                const libro = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(libro, hoja, 'Proximos');
                XLSX.writeFile(libro, 'Proximos_mantenimientos_' + hoy + '.xlsx');
                registrarEvento('exportar_proximos', lista.length + ' equipo(s)');
            } catch (err) { avisar(err.message); }
        }

        /* ============================================================
           v5.4 — ENLACES DIRECTOS
           Cada vista tiene su dirección (#unidad/Hospital X/cal,
           #proximos, #cotizador…). Sirve para mandar por WhatsApp justo la
           pantalla que se quiere mostrar, para que una recarga no regrese al
           dashboard y para que el botón Atrás del navegador o del teléfono
           regrese a la vista anterior. Quien abre un enlace sin sesión entra
           con su PIN y llega a esa vista.
           ============================================================ */

        /* ============================================================
           v5.4 — AVISOS Y CONFIRMACIONES PROPIOS
           alert() y confirm() del navegador bloquean toda la página, se ven
           ajenos a la aplicación y en iPhone, con la app instalada, a veces
           ni aparecen. Estos van dentro de la propia interfaz y devuelven una
           promesa: confirmar() da true o false.
           ============================================================ */
        let dialogoAbierto = null;

        function abrirDialogo(texto, opciones) {
            const o = Object.assign({ titulo: 'Aviso', textoSi: 'Aceptar', textoNo: '', peligro: false }, opciones || {});
            return new Promise(resolve => {
                // Si ya hay uno abierto, el nuevo espera su turno
                const mostrar = () => {
                    const m = document.getElementById('modalDialogo');
                    const si = document.getElementById('dlgSi'), no = document.getElementById('dlgNo');
                    document.getElementById('dlgTitulo').innerText = o.titulo;
                    document.getElementById('dlgTexto').innerText = String(texto || '');
                    si.innerText = o.textoSi;
                    si.className = 'text-sm font-semibold text-white px-5 py-2 rounded-lg transition-colors ' +
                                   (o.peligro ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700');
                    no.innerText = o.textoNo || 'Cancelar';
                    no.classList.toggle('hidden', !o.textoNo);
                    const previoFoco = document.activeElement;
                    const cerrar = (valor) => {
                        m.classList.add('hidden'); m.classList.remove('flex');
                        si.onclick = no.onclick = null;
                        document.removeEventListener('keydown', teclas, true);
                        dialogoAbierto = null;
                        try { if (previoFoco && previoFoco.focus) previoFoco.focus(); } catch (_) {}
                        resolve(valor);
                        if (colaDialogos.length) colaDialogos.shift()();
                    };
                    const teclas = (e) => {
                        if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
                        else if (e.key === 'Tab') {   // el foco no sale del cuadro
                            const focos = [no, si].filter(b => !b.classList.contains('hidden'));
                            const i = focos.indexOf(document.activeElement);
                            e.preventDefault();
                            focos[(i + (e.shiftKey ? focos.length - 1 : 1)) % focos.length].focus();
                        }
                    };
                    si.onclick = () => cerrar(true);
                    no.onclick = () => cerrar(false);
                    document.addEventListener('keydown', teclas, true);
                    dialogoAbierto = cerrar;
                    m.classList.remove('hidden'); m.classList.add('flex');
                    // En una acción peligrosa el foco empieza en Cancelar
                    setTimeout(() => (o.peligro && o.textoNo ? no : si).focus(), 30);
                };
                if (dialogoAbierto) colaDialogos.push(mostrar); else mostrar();
            });
        }
        const colaDialogos = [];

        function avisar(texto, titulo) {
            return abrirDialogo(texto, { titulo: titulo || 'Aviso', textoSi: 'Entendido' });
        }
        function confirmar(texto, opciones) {
            return abrirDialogo(texto, Object.assign({ titulo: 'Confirmar', textoSi: 'Sí, continuar', textoNo: 'Cancelar' }, opciones || {}));
        }


        /* ============================================================
           v5.5 — VENTANAS ACCESIBLES
           Al abrirse cualquier ventana (#modal…) el foco entra en ella, Tab
           no se escapa a la página de atrás y Esc la cierra con su propio
           botón de cerrar. Al cerrarse, el foco regresa a donde estaba. Se
           hace observando las ventanas, sin tocar el código de cada una.
           ============================================================ */
        (function ventanasAccesibles() {
            const FOCO = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            const visibles = (m) => Array.from(m.querySelectorAll(FOCO)).filter(e => e.offsetParent !== null);
            const abierta = (m) => !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
            const previo = new Map();
            const pila = [];

            const alAbrir = (m) => {
                if (pila.includes(m)) return;
                pila.push(m);
                previo.set(m, document.activeElement);
                setTimeout(() => {
                    if (m.contains(document.activeElement)) return;
                    const campo = m.querySelector('input:not([type=hidden]):not([disabled]), textarea, select');
                    const destino = (campo && campo.offsetParent !== null) ? campo : visibles(m)[0];
                    if (destino) destino.focus();
                }, 60);
            };
            const alCerrar = (m) => {
                const i = pila.indexOf(m);
                if (i === -1) return;
                pila.splice(i, 1);
                const p = previo.get(m);
                previo.delete(m);
                try { if (p && document.contains(p) && p.focus) p.focus(); } catch (_) {}
            };

            document.querySelectorAll('[id^="modal"]').forEach(m => {
                if (m.id === 'modalDialogo') return;   // ese ya lo maneja abrirDialogo()
                new MutationObserver(() => (abierta(m) ? alAbrir : alCerrar)(m))
                    .observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
            });

            document.addEventListener('keydown', (e) => {
                const m = pila[pila.length - 1];
                if (!m || !abierta(m)) return;
                if (e.key === 'Escape') {
                    const cerrar = m.querySelector('[aria-label="Cerrar"], [aria-label="Más tarde"]');
                    if (cerrar) { e.preventDefault(); cerrar.click(); }
                } else if (e.key === 'Tab') {
                    const f = visibles(m);
                    if (!f.length) return;
                    const i = f.indexOf(document.activeElement);
                    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
                    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
                }
            });
        })();

        let navegandoDesdeHash = false;

        function hashUnidad(unidad, tab) {
            return '#unidad/' + encodeURIComponent(unidad) + (tab ? '/' + tab : '');
        }

        function fijarHash(h) {
            if (navegandoDesdeHash) return;
            if (location.hash === h) return;
            // Cambiar de pestaña dentro de la misma unidad no agrega un paso al
            // historial: Atrás regresa a la vista anterior, no a la pestaña anterior
            const unidadDe = (x) => (x || '').indexOf('#unidad/') === 0 ? x.split('/').slice(0, 2).join('/') : null;
            const misma = unidadDe(h) && unidadDe(h) === unidadDe(location.hash);
            try { history[misma ? 'replaceState' : 'pushState'](null, '', h); } catch (_) { location.hash = h; }
        }

        function irAUnidad(unidad, tab) {
            if (!clientesUnicos.includes(unidad)) { avisar('La unidad "' + unidad + '" no aparece en los datos cargados.'); return false; }
            mostrarVistaCliente(unidad);
            if (tab) cambiarPestana(tab);
            return false;
        }

        /* Lleva a la vista que indica la dirección. Devuelve true si la reconoció. */
        function navegarDesdeHash() {
            const partes = (location.hash || '').replace(/^#/, '').split('/');
            const vista = partes[0];
            if (!vista) return false;
            navegandoDesdeHash = true;
            try {
                if (vista === 'dashboard') { mostrarDashboard(); return true; }
                if (vista === 'proximos') { mostrarProximos(); return true; }
                if (vista === 'cotizador') { mostrarCotizador(); return true; }
                if (vista === 'catalogos' && esAdministrador()) {
                    mostrarCatalogos().then(() => { if (partes[1]) cambiarPestanaCatalogo(partes[1]); });
                    return true;
                }
                if (vista === 'auditoria' && esAdministrador()) { mostrarAuditoria(); return true; }
                if (vista === 'usuarios' && esAdministrador()) { mostrarAdminUsuarios(); return true; }
                if (vista === 'unidad' && partes[1]) {
                    const unidad = decodeURIComponent(partes[1]);
                    if (!clientesUnicos.includes(unidad)) return false;
                    mostrarVistaCliente(unidad);
                    if (['prev', 'cal', 'corr', 'ent', 'com'].includes(partes[2])) cambiarPestana(partes[2]);
                    return true;
                }
                return false;
            } finally {
                navegandoDesdeHash = false;
            }
        }

        window.addEventListener('popstate', () => { if (datosDetalleOrdenes.length) navegarDesdeHash(); });

        // Cada vista anota su dirección al abrirse (se envuelven las funciones
        // existentes para no tocar cada una)
        (function envolverVistas() {
            const envolver = (nombre, hash) => {
                const original = window[nombre];
                if (typeof original !== 'function') return;
                window[nombre] = function () {
                    const r = original.apply(this, arguments);
                    fijarHash(typeof hash === 'function' ? hash.apply(null, arguments) : hash);
                    return r;
                };
            };
            envolver('mostrarDashboard', '#dashboard');
            envolver('mostrarProximos', '#proximos');
            envolver('mostrarCotizador', '#cotizador');
            envolver('mostrarCatalogos', '#catalogos');
            envolver('mostrarAuditoria', '#auditoria');
            envolver('mostrarAdminUsuarios', '#usuarios');
            envolver('mostrarVistaCliente', (u) => hashUnidad(u, 'prev'));
            envolver('cambiarPestana', (t) => clienteActual && document.getElementById('clienteContent').style.display !== 'none'
                                               ? hashUnidad(clienteActual, t) : location.hash);
            envolver('cambiarPestanaCatalogo', (t) => '#catalogos/' + t);
        })();


        document.getElementById('btnExportarExcel').addEventListener('click', exportarCalendarioExcel);
        document.getElementById('btnExportarPDF').addEventListener('click', exportarCalendarioPDF);

        /* ============================================================
           v4.3 — LECTURA AUTOMÁTICA DEL COMPROBANTE

           El CFDI en XML es un documento estructurado: folio, fecha, folio
           fiscal (UUID), subtotal y el desglose de conceptos vienen en
           atributos con nombre fijo. De ahí se puede llenar la factura sin
           recapturar nada, y con el SUBTOTAL —el importe antes de IVA—, que es
           el que corresponde al servicio.

           El PDF es otra historia y conviene decirlo claro: no tiene
           estructura, solo texto suelto cuyo acomodo cambia con cada emisor.
           Se lee lo que se pueda —folio, fecha, subtotal y números de orden— y
           se marca como lectura aproximada para que se verifique. Si el PDF es
           una imagen escaneada no hay texto que extraer y no se lee nada.

           La asociación con las órdenes se hace buscando los números de orden
           dentro de la descripción de cada concepto. Es el enlace natural:
           el concepto de un CFDI de servicio casi siempre los menciona.
           ============================================================ */

        // "12,345.67" → 12345.67
        function aNumeroCFDI(v) {
            const t = String(v ?? '').replace(/[^\d.-]/g, '');
            const n = parseFloat(t);
            return Number.isFinite(n) ? n : null;
        }

        function parsearCFDI(textoXml) {
            const doc = new DOMParser().parseFromString(textoXml, 'application/xml');
            if (doc.querySelector('parsererror')) throw new Error('El archivo no es un XML válido.');

            /* Los CFDI usan el prefijo cfdi:, pero hay emisores que no lo
               ponen. Buscar por nombre local evita depender del prefijo. */
            const porNombre = (nombre) => {
                const todos = doc.getElementsByTagName('*');
                for (let i = 0; i < todos.length; i++) {
                    if (todos[i].localName === nombre) return todos[i];
                }
                return null;
            };
            const todosPorNombre = (nombre) => {
                const out = [];
                const todos = doc.getElementsByTagName('*');
                for (let i = 0; i < todos.length; i++) {
                    if (todos[i].localName === nombre) out.push(todos[i]);
                }
                return out;
            };

            const comp = porNombre('Comprobante');
            if (!comp) throw new Error('El XML no parece un CFDI: no se encontró el nodo Comprobante.');

            const serie = comp.getAttribute('Serie') || '';
            const folio = comp.getAttribute('Folio') || '';
            const fechaAttr = comp.getAttribute('Fecha') || '';
            const timbre = porNombre('TimbreFiscalDigital');
            const receptor = porNombre('Receptor');
            const emisor = porNombre('Emisor');

            const conceptos = todosPorNombre('Concepto').map(c => ({
                descripcion: c.getAttribute('Descripcion') || '',
                importe: aNumeroCFDI(c.getAttribute('Importe')),
                cantidad: aNumeroCFDI(c.getAttribute('Cantidad'))
            }));

            return {
                origen: 'xml',
                numero: (serie + folio).trim() || folio || serie,
                fecha: fechaAttr ? fechaAttr.slice(0, 10) : '',
                uuid: timbre ? (timbre.getAttribute('UUID') || '') : '',
                subtotal: aNumeroCFDI(comp.getAttribute('SubTotal')),
                total: aNumeroCFDI(comp.getAttribute('Total')),
                receptor: receptor ? (receptor.getAttribute('Nombre') || receptor.getAttribute('Rfc') || '') : '',
                emisor: emisor ? (emisor.getAttribute('Nombre') || '') : '',
                conceptos: conceptos
            };
        }

        /* ============================================================
           v4.5 — CÓMO SE RECONOCE EL SERVICIO EN EL COMPROBANTE

           Un concepto real se ve así:

             "Mantenimiento Preventivo Integral para CENTRAL DE MONITOREO,
              Marca: Philips Modelo: IntelliVue Serie: 5601A11516
              Detalle: O.S. 24598"

           Trae tres datos que pueden identificar la orden, y se usan los tres
           en ese orden de confianza:

             1. el número de O.S., que es el identificador explícito
             2. el NÚMERO DE SERIE del equipo, que el concepto casi siempre
                incluye y que la orden también tiene
             3. cualquier número suelto que coincida con un folio de orden

           La 4.4 solo hacía lo tercero, así que dependía de que el ID con el
           que la plataforma conoce la orden fuera exactamente el número de
           O.S. de la factura. Cuando no coinciden —y con frecuencia no
           coinciden— no reconocía nada y no explicaba por qué. Ahora la serie
           sirve de respaldo y, si aun así no se reconoce, se dice qué se
           extrajo del concepto para poder comparar.
           ============================================================ */

        const normSerie = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

        /* v4.6 — NÚCLEO NUMÉRICO DEL FOLIO

           La orden se guarda como "IAB-24237" y la factura la nombra como
           "O.S. 24237": el mismo servicio con dos prefijos distintos. Lo que
           identifica es el número, así que de ambos lados se toma solo eso.

             "IAB-24237"  → "24237"      "O.S. 24237" → "24237"
             "IAB 24237"  → "24237"      "24237"      → "24237"

           Se toma la ÚLTIMA corrida de dígitos, que es donde vive el
           consecutivo; un prefijo con números —"IAB2-24237"— no la estorba.
           Los ceros a la izquierda se descartan para que "024237" y "24237"
           sean el mismo folio. */
        function nucleoFolio(v) {
            const t = String(v || '').toUpperCase();
            const corridas = t.match(/\d+/g);
            if (!corridas || corridas.length === 0) return t.replace(/[^A-Z0-9]/g, '');
            return corridas[corridas.length - 1].replace(/^0+(?=\d)/, '');
        }

        const mismoFolio = (a, b) => {
            const na = nucleoFolio(a), nb = nucleoFolio(b);
            return na.length >= 2 && na === nb;
        };

        /* Datos identificadores que trae la descripción de un concepto. */
        function pistasDeConcepto(texto) {
            const t = String(texto || '');
            const pistas = { os: [], series: [], numeros: [] };

            /* "O.S. 24598", "O/S 24598", "OS: 24598", "Orden de servicio 24598".
               El separador es obligatorio y se exige inicio de palabra: sin eso,
               el "OS" final de "MARCAPASOS CARDÍACO" se leía como un número de
               orden y el diagnóstico reportaba una O.S. inexistente. */
            const reOS = /(?:\bo\s*[.\/-]\s*s\s*[.:]?|\bos\s*[.:#]|\borden(?:\s+de\s+servicio)?\s*[#:.]?)\s*([A-Z0-9-]{2,})/gi;
            let m;
            while ((m = reOS.exec(t)) !== null) pistas.os.push(m[1]);

            // "Serie: 5601A11516"
            const reSerie = /serie\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/gi;
            while ((m = reSerie.exec(t)) !== null) pistas.series.push(m[1]);

            // Cualquier número largo suelto, como último recurso
            (t.match(/\b\d{3,}\b/g) || []).forEach(n => pistas.numeros.push(n));

            return pistas;
        }

        /* Resuelve un concepto contra las órdenes disponibles.
           Devuelve [{id, via}] indicando con qué dato se reconoció. */
        function resolverOrdenesDeConcepto(texto, ordenes) {
            const pistas = pistasDeConcepto(texto);
            const halladas = new Map();

            const agregar = (orden, via) => {
                if (!halladas.has(String(orden.ID))) halladas.set(String(orden.ID), { id: String(orden.ID), via: via });
            };

            /* 1. Número de O.S. contra el folio de la orden, comparando solo
               el número: "IAB-24237" y "O.S. 24237" son la misma orden. */
            pistas.os.forEach(os => {
                const o = ordenes.find(x => mismoFolio(x.ID, os));
                if (o) agregar(o, 'número de orden');
            });

            // 2. Número de serie del equipo
            pistas.series.forEach(se => {
                const n = normSerie(se);
                if (n.length < 4) return;
                const o = ordenes.find(x => normSerie(x.Serie) === n);
                if (o) agregar(o, 'número de serie');
            });

            /* 3. Último recurso: cualquier número largo del texto que coincida
               con el folio de una orden. Se piden 4 dígitos para no emparejar
               con un modelo o una cantidad. */
            if (halladas.size === 0) {
                pistas.numeros.forEach(num => {
                    if (String(num).replace(/^0+/, '').length < 4) return;
                    const o = ordenes.find(x => mismoFolio(x.ID, num));
                    if (o) agregar(o, 'folio en el texto');
                });
            }

            return { ordenes: Array.from(halladas.values()), pistas: pistas };
        }

        // Resumen de lo que se extrajo, para explicar por qué no se reconoció
        function textoPistas(pistas) {
            const partes = [];
            if (pistas.os.length) partes.push('O.S. ' + pistas.os.join(', '));
            if (pistas.series.length) partes.push('serie ' + pistas.series.join(', '));
            return partes.join(' · ') || 'sin datos identificables';
        }

        /* Se conserva para la carga masiva y para cualquier uso previo:
           devuelve solo los ids reconocidos. */
        function ordenesEnTexto(texto, universoIds) {
            const ordenes = datosDetalleOrdenes.filter(d => universoIds.indexOf(String(d.ID)) > -1);
            return resolverOrdenesDeConcepto(texto, ordenes).ordenes.map(x => x.id);
        }

        function mensajeCFDI(html, tipo) {
            const el = document.getElementById('facLecturaCFDI');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-800 border border-green-200',
                aviso: 'bg-amber-50 text-amber-800 border border-amber-200'
            };
            el.className = 'mt-3 text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.ok);
            el.innerHTML = html;
            el.classList.toggle('hidden', !html);
        }

        /* Vuelca lo leído sobre el formulario y sobre los importes por orden. */
        function aplicarComprobante(datos) {
            if (datos.numero) document.getElementById('facNumero').value = datos.numero;
            if (datos.fecha) document.getElementById('facFecha').value = datos.fecha;
            facturaUUID = datos.uuid || '';

            /* Se buscan primero las órdenes de la unidad abierta. Si el
               comprobante no coincide con ninguna, se vuelve a intentar contra
               todo el historial: así se puede avisar que las órdenes existen
               pero pertenecen a otra unidad, en vez de decir que no hay nada. */
            const deLaUnidad = datosDetalleOrdenes.filter(d => d.Cliente === clienteActual);

            const asignadas = [], agregadas = [], sinAsociar = [], deOtraUnidad = [];
            const vias = new Set();

            (datos.conceptos || []).forEach(c => {
                let r = resolverOrdenesDeConcepto(c.descripcion, deLaUnidad);

                if (r.ordenes.length === 0) {
                    const global = resolverOrdenesDeConcepto(c.descripcion, datosDetalleOrdenes);
                    if (global.ordenes.length) {
                        global.ordenes.forEach(o => {
                            const d = datosDetalleOrdenes.find(x => String(x.ID) === o.id);
                            deOtraUnidad.push(o.id + ' (' + (d ? d.Cliente : 'otra unidad') + ')');
                        });
                    } else {
                        sinAsociar.push({ desc: c.descripcion, pistas: r.pistas });
                    }
                    return;
                }

                const porOrden = (c.importe !== null) ? redondear(c.importe / r.ordenes.length) : null;
                r.ordenes.forEach(o => {
                    vias.add(o.via);
                    let fila = ordenesFacturaActual.find(x => x.id === o.id);
                    if (!fila) {
                        if (facturaPorOrden.has(o.id)) return;      // ya está en otra factura
                        fila = { id: o.id, importe: null, tocado: false };
                        ordenesFacturaActual.push(fila);
                        agregadas.push(o.id);
                    }
                    if (porOrden !== null) { fila.importe = porOrden; fila.tocado = true; }
                    asignadas.push(o.id);
                });
            });

            renderListaOrdenesFactura();

            // Resumen honesto de lo que se leyó y de lo que no
            const partes = [];
            partes.push('<p class="font-bold">' + (datos.origen === 'xml' ? 'CFDI leído' : 'PDF leído (aproximado)') + '</p>');
            partes.push('<p>' + esc(datos.numero || 'sin folio') + ' · ' + esc(datos.fecha || 'sin fecha') +
                        (datos.subtotal !== null ? ' · subtotal ' + fmtMoneda(datos.subtotal, 'MXN') : '') + '</p>');
            if (datos.receptor) partes.push('<p class="opacity-80">Receptor: ' + esc(datos.receptor) + '</p>');
            if (datos.uuid) partes.push('<p class="font-mono text-xs opacity-80">' + esc(datos.uuid) + '</p>');

            if (asignadas.length) {
                partes.push('<p>' + asignadas.length + ' orden(es) con importe asignado' +
                            (vias.size ? ' (por ' + Array.from(vias).join(' y ') + ')' : '') +
                            (agregadas.length ? ', ' + agregadas.length + ' agregada(s) desde el comprobante' : '') + '.</p>');
            }

            if (deOtraUnidad.length) {
                partes.push('<p class="font-semibold">Este comprobante ampara órdenes de otra unidad: ' +
                            esc(deOtraUnidad.join(' · ')) + '. Regístralo desde esa unidad.</p>');
            }

            if (sinAsociar.length) {
                partes.push('<p class="font-semibold">' + sinAsociar.length + ' concepto(s) sin orden reconocible:</p>' +
                    sinAsociar.map(x =>
                        '<p class="pl-3">· ' + esc((x.desc || '').slice(0, 60)) +
                        '<br><span class="opacity-80">se leyó: ' + esc(textoPistas(x.pistas)) + '</span></p>').join(''));
                partes.push('<p class="opacity-80">Si el número de O.S. de la factura no es el mismo folio con el que ' +
                            'la plataforma conoce la orden, captura ese concepto a mano.</p>');
            }

            const suma = totalFacturaActual();
            let tipo = (datos.origen === 'xml') ? 'ok' : 'aviso';
            if (datos.subtotal !== null && Math.abs(suma - datos.subtotal) > 0.5) {
                partes.push('<p class="font-bold">La suma de los importes (' + fmtMoneda(suma, 'MXN') +
                            ') no coincide con el subtotal del comprobante (' + fmtMoneda(datos.subtotal, 'MXN') + ').</p>');
                tipo = 'aviso';
            }
            if (deOtraUnidad.length || sinAsociar.length) tipo = 'aviso';
            if (datos.origen !== 'xml') {
                partes.push('<p>Lectura aproximada: el PDF no tiene estructura fija. Verifica folio, fecha e importes antes de guardar.</p>');
            }
            mensajeCFDI(partes.join(''), tipo);
        }

        /* ---------- PDF: lectura de respaldo ---------- */
        function cargarPdfJs() {
            if (window.pdfjsLib) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const sc = document.createElement('script');
                sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                sc.onload = () => {
                    try {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    } catch (_) {}
                    resolve();
                };
                sc.onerror = () => reject(new Error('No se pudo cargar el lector de PDF. Usa el XML del CFDI, que además es más confiable.'));
                document.head.appendChild(sc);
            });
        }

        async function textoDePdf(archivo) {
            await cargarPdfJs();
            const buffer = await archivo.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
            let texto = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const pagina = await pdf.getPage(i);
                const contenido = await pagina.getTextContent();
                texto += contenido.items.map(x => x.str).join(' ') + '\n';
            }
            return texto;
        }

        function parsearTextoFactura(texto) {
            const t = String(texto || '');
            if (t.replace(/\s/g, '').length < 40) {
                throw new Error('El PDF no tiene texto que leer: parece una imagen escaneada. Usa el XML del CFDI.');
            }

            const uuid = (t.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/) || [''])[0];
            const folio = (t.match(/folio\s*(?:fiscal)?\s*[:#]?\s*([A-Z]{0,4}[-\s]?\d{1,10})/i) || [])[1] || '';
            const subtotal = (() => {
                const m = t.match(/sub\s*-?\s*total\s*[:$]*\s*([\d,]+\.\d{2})/i);
                return m ? aNumeroCFDI(m[1]) : null;
            })();
            let fecha = '';
            const mIso = t.match(/(20\d{2})-(\d{2})-(\d{2})/);
            if (mIso) fecha = mIso[0];
            else {
                const mDmy = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);
                if (mDmy) fecha = mDmy[3] + '-' + String(mDmy[2]).padStart(2, '0') + '-' + String(mDmy[1]).padStart(2, '0');
            }

            return {
                origen: 'pdf',
                numero: folio.replace(/\s+/g, '').replace(/^-+/, ''),
                fecha: fecha, uuid: uuid,
                subtotal: subtotal, total: null, receptor: '', emisor: '',
                // Sin conceptos estructurados: se usa todo el texto como uno solo
                conceptos: [{ descripcion: t, importe: subtotal, cantidad: 1 }]
            };
        }

        async function leerComprobante(archivo) {
            mensajeCFDI('<p>Leyendo el comprobante…</p>', 'ok');
            try {
                const esXml = /\.xml$/i.test(archivo.name) || archivo.type.indexOf('xml') > -1;
                const datos = esXml
                    ? parsearCFDI(await archivo.text())
                    : parsearTextoFactura(await textoDePdf(archivo));

                if (datos.receptor && clienteActual &&
                    !normalizar(datos.receptor.toLowerCase()).includes(normalizar(clienteActual.toLowerCase().slice(0, 8)))) {
                    // No se bloquea: los nombres fiscales rara vez coinciden con los de uso
                    console.warn('[CFDI] receptor "' + datos.receptor + '" no coincide con "' + clienteActual + '"');
                }
                aplicarComprobante(datos);
            } catch (err) {
                mensajeCFDI('<p class="font-bold">No se pudo leer el comprobante</p><p>' + esc(err.message) + '</p>', 'error');
            }
        }

        document.getElementById('facComprobante').addEventListener('change', (e) => {
            const archivo = (e.target.files || [])[0];
            e.target.value = '';
            if (archivo) leerComprobante(archivo);
        });

        /* ============================================================
           v4.7 — IMPORTE CON LETRA
           "29000.00" → "VEINTINUEVE MIL PESOS 00/100 M.N."
           Con las reglas del español que suelen fallar: "UN MIL" no existe,
           "CIEN" solo cuando es exacto, "VEINTIÚN" ante sustantivo y
           "UN MILLÓN DE PESOS" cuando la cifra es de millones redondos.
           ============================================================ */
        function numeroALetras(monto) {
            const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
                              'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
                              'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS',
                              'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
            const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
            const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
                              'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

            function menorDeMil(n) {
                if (n === 0) return '';
                if (n === 100) return 'CIEN';
                const c = Math.floor(n / 100), r = n % 100;
                let t = CENTENAS[c];
                if (r > 0) {
                    let d;
                    if (r < 30) d = UNIDADES[r];
                    else {
                        const dec = Math.floor(r / 10), u = r % 10;
                        d = DECENAS[dec] + (u ? ' Y ' + UNIDADES[u] : '');
                    }
                    t = (t ? t + ' ' : '') + d;
                }
                return t;
            }

            const valor = Math.round(Math.abs(Number(monto) || 0) * 100) / 100;
            let entero = Math.floor(valor);
            const centavos = Math.round((valor - entero) * 100);

            let letras = '';
            if (entero === 0) letras = 'CERO';
            else {
                const millones = Math.floor(entero / 1000000);
                const miles = Math.floor((entero % 1000000) / 1000);
                const resto = entero % 1000;
                const partes = [];
                if (millones) partes.push(millones === 1 ? 'UN MILLÓN' : menorDeMil(millones) + ' MILLONES');
                if (miles) partes.push(miles === 1 ? 'MIL' : menorDeMil(miles) + ' MIL');
                if (resto) partes.push(menorDeMil(resto));
                letras = partes.join(' ');
            }

            // "UN MILLÓN DE PESOS", "DOS MILLONES DE PESOS" solo si no hay miles ni unidades
            const deMillones = entero >= 1000000 && entero % 1000000 === 0;
            const moneda = (entero === 1) ? 'PESO' : 'PESOS';
            return letras + (deMillones ? ' DE ' : ' ') + moneda + ' ' +
                   String(centavos).padStart(2, '0') + '/100 M.N.';
        }

        /* ============================================================
           v4.7 — COTIZADOR DE MATERIALES Y SERVICIOS

           Reproduce el formato con el que ya se cotiza —encabezado con folio,
           fecha, vigencia y condiciones; tabla de partidas; subtotal, IVA,
           total e importe con letra; observaciones; y una segunda hoja con
           condiciones, garantía y datos bancarios— pero con tres diferencias
           que importan:

             · el FOLIO lo asigna el servidor, así que no se repite ni se salta
             · cada cotización queda guardada y se puede reimprimir, duplicar
               o darle seguimiento (enviada, aceptada, rechazada)
             · los datos fijos —emisor, banco, condiciones— salen de la hoja
               Config_Cotizacion, no del código

           La segunda hoja no reproduce los logotipos de las marcas del
           formato original: esas imágenes son propiedad de cada fabricante.
           Se listan los nombres, que comunican lo mismo.
           ============================================================ */
        let configCotizacion = {};
        let catalogoCotizacion = [];
        let cotizaciones = [];
        let cotizacionEnEdicion = null;
        let partidasCot = [];

        const valorConfig = (clave, defecto) => {
            const k = normalizar(String(clave).toLowerCase());
            for (const [c, v] of Object.entries(configCotizacion)) {
                if (normalizar(c.toLowerCase()) === k) return v;
            }
            return defecto === undefined ? '' : defecto;
        };

        function procesarConfigCotizacion(data) {
            configCotizacion = {};
            (data || []).forEach(r => {
                const llaves = Object.keys(r);
                const clave = String(r[llaves[0]] || '').trim();
                if (clave) configCotizacion[clave] = String(r[llaves[1]] || '').trim();
            });
        }

        /* v4.8 — El catálogo del cotizador sale de Precios_Mantenimiento, la
           misma hoja que alimenta facturación y auditoría. Cada renglón trae sus
           tres niveles; en los conceptos que solo tienen Nivel I, ese precio vale
           para los tres. La hoja Catalogo_Cotizacion de la 4.7, si existe, se
           suma al final para no perder lo que ya se hubiera capturado ahí. */
        let catalogoCotizacionLegado = [];

        function conceptosDelCotizador() {
            const desdeTarifario = catalogoPrecios.map(t => {
                const esMant = tipoConTarifario(t.servicio);
                const serv = normalizar(t.servicio.toLowerCase());
                let descripcion = t.equipo + (t.marca ? ' · Marca ' + t.marca : '');   // v5.2
                if (esMant && serv.includes('calibracion')) descripcion = 'Calibración de ' + t.equipo;
                else if (esMant) descripcion = 'Mantenimiento preventivo integral para ' + t.equipo;
                return {
                    grupo: esMant ? (serv.includes('calibracion') ? 'Calibraciones' : 'Mantenimientos preventivos')
                                  : (t.servicio || 'Conceptos'),
                    descripcion: descripcion,
                    unidad: t.unidad || (esMant ? 'Servicio' : 'Pieza'),
                    precios: t.precios,
                    clave: t.clave || ''
                };
            });
            const legado = catalogoCotizacionLegado.map(c => ({
                grupo: c.tipo || 'Conceptos', descripcion: c.descripcion, unidad: c.unidad,
                precios: { I: c.precio, II: null, III: null }, clave: ''
            }));
            return desdeTarifario.concat(legado);
        }

        // Precio de un concepto en un nivel; si el nivel está vacío, se usa el I
        function precioConcepto(concepto, nivel) {
            const p = concepto.precios || {};
            const v = p[nivel];
            if (v !== null && v !== undefined && v !== '') return Number(v) || 0;
            return Number(p.I) || 0;
        }

        /* v5.0 — Concepto del catálogo del que salió una partida. Se busca por
           su número de catálogo, que no cambia; el índice ('origen') solo se usa
           para partidas guardadas antes de que existiera el número, porque la
           posición en la lista se mueve en cuanto se agrega o borra un concepto. */
        function conceptoDePartida(p) {
            if (p && p.clave) return catalogoCotizacion.find(c => c.clave === p.clave) || null;
            if (!p || p.origen === null || p.origen === undefined || p.origen === '') return null;
            return catalogoCotizacion[parseInt(p.origen, 10)] || null;
        }

        function procesarCatalogoCotizacion(data) {
            catalogoCotizacionLegado = [];
            if (!data || !data.length) return;
            const llaves = Object.keys(data[0]);
            const cTipo = buscarColumna(llaves, ['tipo']);
            const cDesc = buscarColumna(llaves, ['descripcion', 'descripción', 'concepto']);
            const cUni = buscarColumna(llaves, ['unidad']);
            const cPre = buscarColumna(llaves, ['precio', 'precio unitario']);
            data.forEach(r => {
                const desc = cDesc ? String(r[cDesc] || '').trim() : '';
                if (!desc) return;
                catalogoCotizacionLegado.push({
                    tipo: cTipo ? String(r[cTipo] || '').trim() : '',
                    descripcion: desc,
                    unidad: cUni ? (String(r[cUni] || '').trim() || 'Pieza') : 'Pieza',
                    precio: cPre ? (aNumeroPrecio(r[cPre]) || 0) : 0
                });
            });
        }

        /* ============================================================
           v4.9 — CATÁLOGOS DE CLIENTES Y DE PRECIOS DESDE LA APP

           Hasta la 4.8 los precios se capturaban abriendo la hoja de
           cálculo, y los datos fiscales del cliente salían de su última
           cotización, si la había. Ahora las dos cosas se administran aquí.

           Clientes: la ficha trae razón social, RFC, dirección, atención a,
           contacto, la UNIDAD con la que aparece en las órdenes —que es el
           enlace con su historial, sus facturas y su calendario— y su NIVEL
           de convenio, que el cotizador aplica solo al elegirlo.

           Precios: se dan de alta, se corrigen y se eliminan conceptos de
           Precios_Mantenimiento. Al guardar se vuelve a descargar el
           tarifario, así que el cotizador, la facturación y la auditoría lo
           ven en ese momento, sin recargar la página.

           Consultar ambos catálogos es para todos; modificarlos, solo con
           credencial de administrador, y el servidor lo vuelve a comprobar.
           ============================================================ */
        let catalogoClientes = [];
        let clienteEnEdicion = null;
        let preciosAdmin = [];
        let precioEnEdicion = null;
        let pestanaCatalogo = 'clientes';

        async function cargarCatalogoClientes() {
            if (!hayBackend()) { catalogoClientes = []; return; }
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ accion: 'listarClientes', token: tokenSesion() })
                });
                const j = await r.json().catch(() => null);
                catalogoClientes = (j && j.ok) ? j.clientes : [];
            } catch (_) { catalogoClientes = []; }
            catalogoClientes.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'));
        }

        async function cargarPreciosAdmin() {
            const j = await peticionAdmin('listarPreciosAdmin', {});
            preciosAdmin = j.precios || [];
        }

        /* Después de tocar precios se vuelve a bajar el tarifario, con el caché
           del servidor saltado, para que todo lo que depende de él se entere. */
        async function refrescarTarifario() {
            try {
                const texto = await descargarHoja('precios', true);
                Papa.parse(texto, {
                    header: true, skipEmptyLines: true,
                    transformHeader: h => normalizar(h.trim().toLowerCase()),
                    complete: r => procesarCatalogoPrecios(r.data)
                });
            } catch (_) { /* si falla, se verá en la siguiente carga */ }
        }

        async function mostrarCatalogos() {
            if (!esAdministrador()) { avisar('Los catálogos se administran con rol de administrador.'); return; }
            if (!(await asegurarCredencialAdmin())) return;
            resetSidebarStyles();
            const btn = document.getElementById('btnCatalogos');
            btn.classList.add('border-l-4', 'border-brand-500', 'bg-slate-800/50', 'text-white');
            btn.classList.remove('text-slate-400');
            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'none';
            ['adminUsuariosContent', 'auditoriaContent', 'cotizadorContent'].forEach(id =>
                document.getElementById(id).classList.add('hidden'));
            document.getElementById('catalogosContent').classList.remove('hidden');
            cerrarSidebarMovil();
            registrarEvento('ver_catalogos');

            // Unidades disponibles para enlazar clientes con su historial
            document.getElementById('cliUnidad').innerHTML = '<option value="">— Sin enlazar —</option>' +
                clientesUnicos.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');

            document.getElementById('catListaClientes').innerHTML = '<p class="text-sm text-slate-500 italic">Cargando…</p>';
            await cargarCatalogoClientes();
            limpiarFormCliente();
            renderClientesCatalogo();

            try { await cargarPreciosAdmin(); }
            catch (err) { preciosAdmin = []; mensajeCatUI('preMensaje', err.message, 'error'); }
            limpiarFormPrecio();
            renderPreciosCatalogo();
        }

        /* v5.2 — Tres pestañas: Clientes, Servicios y Productos. Servicios y
           Productos comparten el mismo panel y la misma hoja; cambia el filtro
           por categoría, el formulario (los productos llevan marca) y los
           tipos sugeridos. */
        const CATEGORIA_DE_PESTANA = { servicios: 'Servicio', productos: 'Producto' };
        const TIPOS_SUGERIDOS = {
            Servicio: ['Preventivo', 'Calibración', 'Correctivo', 'Servicio', 'Instalación', 'Capacitación'],
            Producto: ['Refacción', 'Material', 'Consumible', 'Accesorio', 'Equipo']
        };
        function categoriaCatalogo() { return CATEGORIA_DE_PESTANA[pestanaCatalogo] || 'Servicio'; }

        function cambiarPestanaCatalogo(cual) {
            const anterior = pestanaCatalogo;
            pestanaCatalogo = cual;
            [['tabCatCli', 'clientes'], ['tabCatSer', 'servicios'], ['tabCatPro', 'productos']].forEach(([id, k]) => {
                document.getElementById(id).classList.toggle('tab-active', k === cual);
                document.getElementById(id).classList.toggle('tab-inactive', k !== cual);
            });
            const cli = cual === 'clientes';
            document.getElementById('catPanelClientes').style.display = cli ? 'block' : 'none';
            document.getElementById('catPanelPrecios').style.display = cli ? 'none' : 'block';
            if (!cli) {
                if (anterior !== cual) {
                    document.getElementById('catBuscarPre').value = '';
                    document.getElementById('catFiltroServ').value = 'todos';
                }
                limpiarFormPrecio();
                renderPreciosCatalogo();
            }
        }

        function mensajeCatUI(id, texto, tipo) {
            const el = document.getElementById(id);
            const estilos = { error: 'bg-red-50 text-red-700 border border-red-200',
                              ok: 'bg-green-50 text-green-700 border border-green-200',
                              info: 'bg-slate-100 text-slate-600 border border-slate-200' };
            el.className = 'text-xs rounded-lg p-2.5 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        /* ---------- Clientes ---------- */
        function renderClientesCatalogo() {
            const cont = document.getElementById('catListaClientes');
            const lista = listaClientesFiltrada();

            if (!lista.length) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic py-6 text-center">' +
                    (catalogoClientes.length ? 'Ningún cliente coincide.' : 'Todavía no hay clientes. Captura el primero con el formulario.') + '</p>';
                return;
            }
            const th = 'px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider';
            cont.innerHTML = '<table class="min-w-full divide-y divide-slate-200 text-sm"><thead class="bg-slate-50"><tr>' +
                '<th class="' + th + '">Cliente</th><th class="' + th + '">RFC</th><th class="' + th + '">Unidad</th>' +
                '<th class="' + th + '">Nivel</th><th class="' + th + '"></th></tr></thead><tbody class="divide-y divide-slate-100">' +
                lista.map(c =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="px-3 py-2"><p class="font-semibold text-slate-800">' + esc(c.razonSocial) + '</p>' +
                            '<p class="text-xs text-slate-500">' + esc(c.atencion || c.correo || '') + '</p></td>' +
                        '<td class="px-3 py-2 font-mono text-xs text-slate-600">' + esc(c.rfc || '—') + '</td>' +
                        '<td class="px-3 py-2 text-xs text-slate-600">' + (c.unidad ? esc(c.unidad)
                            : '<span class="text-amber-600">sin enlazar</span>') + '</td>' +
                        '<td class="px-3 py-2 text-xs font-bold text-slate-700">' + esc(c.nivel || 'I') + '</td>' +
                        '<td class="px-3 py-2 text-right whitespace-nowrap">' +
                            '<button data-cli-editar="' + esc(c.id) + '" class="text-xs font-semibold text-brand-600 hover:text-brand-800 px-1">Editar</button>' +
                            '<button data-cli-eliminar="' + esc(c.id) + '" class="text-xs font-semibold text-red-500 hover:text-red-700 px-1">Eliminar</button>' +
                        '</td>' +
                    '</tr>').join('') +
                '</tbody></table>';
        }

        function limpiarFormCliente() {
            clienteEnEdicion = null;
            ['cliRazon', 'cliRFC', 'cliDireccion', 'cliAtencion', 'cliCorreo', 'cliTelefono', 'cliNotas']
                .forEach(id => { document.getElementById(id).value = ''; });
            document.getElementById('cliNivel').value = 'I';
            document.getElementById('cliUnidad').value = '';
            document.getElementById('catTituloCli').innerText = 'Nuevo cliente';
            document.getElementById('btnGuardarCliente').innerText = 'Guardar cliente';
            document.getElementById('catCancelarCli').classList.add('hidden');
            mensajeCatUI('cliMensaje', '', 'info');
        }

        function editarClienteCatalogo(id) {
            const c = catalogoClientes.find(x => x.id === id);
            if (!c) return;
            clienteEnEdicion = c;
            document.getElementById('cliRazon').value = c.razonSocial;
            document.getElementById('cliRFC').value = c.rfc;
            document.getElementById('cliDireccion').value = c.direccion;
            document.getElementById('cliAtencion').value = c.atencion;
            document.getElementById('cliCorreo').value = c.correo;
            document.getElementById('cliTelefono').value = c.telefono;
            document.getElementById('cliNotas').value = c.notas;
            document.getElementById('cliNivel').value = c.nivel || 'I';
            const selU = document.getElementById('cliUnidad');
            if (c.unidad && !Array.from(selU.options).some(o => o.value === c.unidad)) {
                selU.insertAdjacentHTML('beforeend', '<option value="' + esc(c.unidad) + '">' + esc(c.unidad) + '</option>');
            }
            selU.value = c.unidad || '';
            document.getElementById('catTituloCli').innerText = 'Editar cliente';
            document.getElementById('btnGuardarCliente').innerText = 'Guardar cambios';
            document.getElementById('catCancelarCli').classList.remove('hidden');
            mensajeCatUI('cliMensaje', '', 'info');
        }

        function datosFormCliente() {
            return {
                id: clienteEnEdicion ? clienteEnEdicion.id : '',
                razonSocial: document.getElementById('cliRazon').value.trim(),
                rfc: document.getElementById('cliRFC').value.trim().toUpperCase(),
                direccion: document.getElementById('cliDireccion').value.trim(),
                atencion: document.getElementById('cliAtencion').value.trim(),
                correo: document.getElementById('cliCorreo').value.trim(),
                telefono: document.getElementById('cliTelefono').value.trim(),
                unidad: document.getElementById('cliUnidad').value,
                nivel: document.getElementById('cliNivel').value,
                notas: document.getElementById('cliNotas').value.trim()
            };
        }

        async function enviarCliente(datos) {
            const j = await peticionAdmin('guardarCliente', { cliente: datos });
            await cargarCatalogoClientes();
            return j;
        }

        async function guardarClienteDesdeForm() {
            const d = datosFormCliente();
            if (!d.razonSocial) { mensajeCatUI('cliMensaje', 'La razón social es obligatoria.', 'error'); return; }
            const btn = document.getElementById('btnGuardarCliente');
            btn.disabled = true;
            try {
                const j = await enviarCliente(d);
                limpiarFormCliente();
                renderClientesCatalogo();
                mensajeCatUI('cliMensaje', j.nuevo ? 'Cliente dado de alta.' : 'Cliente actualizado.', 'ok');
            } catch (err) {
                mensajeCatUI('cliMensaje', err.message, 'error');
            } finally { btn.disabled = false; }
        }

        document.getElementById('catListaClientes').addEventListener('click', async (e) => {
            const ed = e.target.closest('[data-cli-editar]');
            if (ed) { editarClienteCatalogo(ed.dataset.cliEditar); return; }
            const el = e.target.closest('[data-cli-eliminar]');
            if (!el) return;
            const c = catalogoClientes.find(x => x.id === el.dataset.cliEliminar);
            if (!c || !(await confirmar('¿Eliminar a "' + c.razonSocial + '" del catálogo? Sus cotizaciones y facturas no se borran.', { titulo: 'Eliminar cliente', textoSi: 'Eliminar', peligro: true }))) return;
            try {
                await peticionAdmin('eliminarCliente', { id: c.id });
                await cargarCatalogoClientes();
                if (clienteEnEdicion && clienteEnEdicion.id === c.id) limpiarFormCliente();
                renderClientesCatalogo();
            } catch (err) { avisar(err.message); }
        });
        document.getElementById('catBuscarCli').addEventListener('input', () => renderClientesCatalogo());

        /* ---------- Precios ---------- */
        function renderPreciosCatalogo() {
            const cont = document.getElementById('catListaPrecios');
            const cat = categoriaCatalogo();
            const esProd = cat === 'Producto';
            const deLaCategoria = preciosAdmin.filter(x => (x.categoria || 'Servicio') === cat);
            const tipos = [...new Set(deLaCategoria.map(x => x.servicio))].sort((a, b) => a.localeCompare(b, 'es'));

            // Filtro por tipo y sugerencias del campo Tipo
            const sel = document.getElementById('catFiltroServ');
            const actual = sel.value || 'todos';
            sel.innerHTML = '<option value="todos">Todos los tipos</option>' +
                tipos.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
            sel.value = tipos.indexOf(actual) > -1 ? actual : 'todos';
            document.getElementById('listaTiposPrecio').innerHTML =
                [...new Set(TIPOS_SUGERIDOS[cat].concat(tipos))]
                    .map(t => '<option value="' + esc(t) + '">').join('');

            document.getElementById('listaMarcasPrecio').innerHTML =
                [...new Set(deLaCategoria.map(x => x.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
                    .map(m => '<option value="' + esc(m) + '">').join('');

            const lista = listaPreciosFiltrada();

            if (!lista.length) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic py-6 text-center">' +
                    (deLaCategoria.length ? 'Ningún concepto coincide.'
                                          : (esProd ? 'Sin productos todavía.' : 'Sin servicios todavía.')) + '</p>';
                return;
            }
            const th = 'px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider';
            cont.innerHTML = '<table class="min-w-full divide-y divide-slate-200 text-sm"><thead class="bg-slate-50 sticky top-0"><tr>' +
                '<th class="' + th + ' text-left whitespace-nowrap">No. cat.</th>' +
                '<th class="' + th + ' text-left">Tipo</th><th class="' + th + ' text-left">' + (esProd ? 'Producto' : 'Concepto') + '</th>' +
                (esProd ? '<th class="' + th + ' text-left">Marca</th>' : '') +
                '<th class="' + th + ' text-right">Nivel I</th><th class="' + th + ' text-right">Nivel II</th>' +
                '<th class="' + th + ' text-right">Nivel III</th><th class="' + th + '"></th></tr></thead>' +
                '<tbody class="divide-y divide-slate-100">' +
                lista.map(x =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">' + (x.clave ? esc(x.clave) : '<span class="text-slate-400">—</span>') + '</td>' +
                        '<td class="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">' + esc(x.servicio) + '</td>' +
                        '<td class="px-3 py-2"><p class="text-slate-800">' + esc(x.concepto) + '</p>' +
                            (x.unidad ? '<p class="text-xs text-slate-400">' + esc(x.unidad) + '</p>' : '') + '</td>' +
                        (esProd ? '<td class="px-3 py-2 text-xs text-slate-600">' + (x.marca ? esc(x.marca) : '<span class="text-slate-400">—</span>') + '</td>' : '') +
                        ['n1', 'n2', 'n3'].map(k => '<td class="px-3 py-2 text-right font-mono text-xs whitespace-nowrap">' +
                            fmtMoneda(x[k], x.moneda) + '</td>').join('') +
                        '<td class="px-3 py-2 text-right whitespace-nowrap">' +
                            '<button data-pre-editar="' + esc(x.id) + '" class="text-xs font-semibold text-brand-600 hover:text-brand-800 px-1">Editar</button>' +
                            '<button data-pre-eliminar="' + esc(x.id) + '" class="text-xs font-semibold text-red-500 hover:text-red-700 px-1">Eliminar</button>' +
                        '</td>' +
                    '</tr>').join('') +
                '</tbody></table>';
        }

        // Lista de la pestaña actual con la búsqueda y el filtro de tipo aplicados
        function listaPreciosFiltrada() {
            const cat = categoriaCatalogo();
            const tipo = document.getElementById('catFiltroServ').value || 'todos';
            const q = normalizar(document.getElementById('catBuscarPre').value.toLowerCase()).trim();
            return preciosAdmin.filter(x =>
                (x.categoria || 'Servicio') === cat &&
                (tipo === 'todos' || x.servicio === tipo) &&
                (!q || normalizar((x.concepto + ' ' + (x.marca || '') + ' ' + (x.clave || '')).toLowerCase()).includes(q)));
        }

        function listaClientesFiltrada() {
            const q = normalizar(document.getElementById('catBuscarCli').value.toLowerCase()).trim();
            return catalogoClientes.filter(c => !q ||
                normalizar((c.razonSocial + ' ' + c.rfc + ' ' + c.unidad + ' ' + c.atencion).toLowerCase()).includes(q));
        }

        /* v5.2 — Exporta a Excel el catálogo de la pestaña, tal como se ve:
           con la búsqueda y el filtro aplicados (sin ellos, sale completo). */
        async function exportarCatalogoExcel(cual) {
            const hoy = new Date().toISOString().slice(0, 10);
            let titulo, encabezados, filas, anchos;
            if (cual === 'clientes') {
                const lista = listaClientesFiltrada();
                titulo = 'Clientes';
                encabezados = ['Razón social', 'RFC', 'Dirección', 'Atención a', 'Correo', 'Teléfono', 'Unidad', 'Nivel', 'Notas'];
                filas = lista.map(c => [c.razonSocial, c.rfc, c.direccion, c.atencion, c.correo, c.telefono, c.unidad, c.nivel, c.notas]);
                anchos = [36, 16, 40, 24, 28, 16, 28, 8, 30];
            } else {
                const esProd = cual === 'productos';
                const lista = listaPreciosFiltrada().slice()
                    .sort((a, b) => a.servicio.localeCompare(b.servicio, 'es') || a.concepto.localeCompare(b.concepto, 'es'));
                titulo = esProd ? 'Productos' : 'Servicios';
                const num = v => (v === null || v === undefined || v === '') ? '' : Number(v);
                encabezados = ['No. catálogo', 'Tipo', esProd ? 'Producto' : 'Concepto']
                    .concat(esProd ? ['Marca'] : [])
                    .concat(['Unidad', 'Nivel I', 'Nivel II', 'Nivel III', 'Moneda', 'Notas']);
                filas = lista.map(x => [x.clave, x.servicio, x.concepto].concat(esProd ? [x.marca] : [])
                    .concat([x.unidad, num(x.n1), num(x.n2), num(x.n3), x.moneda, x.notas]));
                anchos = [13, 16, 44].concat(esProd ? [18] : []).concat([12, 12, 12, 12, 8, 30]);
            }
            if (!filas.length) { avisar('No hay registros que exportar con la búsqueda actual.'); return; }
            try {
                await cargarSheetJS();
                const aoa = [['Catálogo de ' + titulo.toLowerCase() + ' · Ingenieros Asociados'],
                             ['Exportado el ' + hoy + ' · ' + filas.length + ' registro(s)'], [], encabezados].concat(filas);
                const hoja = XLSX.utils.aoa_to_sheet(aoa);
                hoja['!cols'] = anchos.map(w => ({ wch: w }));
                hoja['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + filas.length, c: encabezados.length - 1 } }) };
                // Precios con formato de moneda
                if (cual !== 'clientes') {
                    const c0 = encabezados.indexOf('Nivel I');
                    for (let r = 4; r < 4 + filas.length; r++) for (let c = c0; c < c0 + 3; c++) {
                        const cel = hoja[XLSX.utils.encode_cell({ r: r, c: c })];
                        if (cel && cel.t === 'n') cel.z = '"$"#,##0.00';
                    }
                }
                const libro = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(libro, hoja, titulo);
                XLSX.writeFile(libro, 'Catalogo_' + titulo + '_' + hoy + '.xlsx');
                registrarEvento('exportar_catalogo', titulo + ' · ' + filas.length + ' registro(s)');
            } catch (err) { avisar(err.message); }
        }

        function limpiarFormPrecio() {
            precioEnEdicion = null;
            ['preServicio', 'preUnidad', 'preConcepto', 'preMarca', 'preN1', 'preN2', 'preN3', 'preNotas']
                .forEach(id => { document.getElementById(id).value = ''; });
            const esProd = categoriaCatalogo() === 'Producto';
            document.getElementById('preMarcaWrap').classList.toggle('hidden', !esProd);
            document.getElementById('preServicio').placeholder = esProd ? 'Refacción' : 'Preventivo';
            document.getElementById('preUnidad').placeholder = esProd ? 'Pieza, Caja, Kit…' : 'Servicio, Hora…';
            document.getElementById('preConceptoEt').innerText = esProd ? 'Producto o descripción *' : 'Concepto o tipo de equipo *';
            document.getElementById('preConceptoAyuda').innerText = esProd
                ? 'Describe el producto sin la marca (por ejemplo "Sensor de SpO2 adulto reusable"); la marca va en su propio campo.'
                : 'En preventivos y calibraciones, el tipo de equipo genérico ("Ventilador") cubre a todos sus modelos.';
            document.getElementById('catTituloPre').innerText = esProd ? 'Nuevo producto' : 'Nuevo servicio';
            document.getElementById('preClave').innerText = 'Se asigna al guardar';
            document.getElementById('btnGuardarPrecio').innerText = esProd ? 'Guardar producto' : 'Guardar servicio';
            document.getElementById('catCancelarPre').classList.add('hidden');
            mensajeCatUI('preMensaje', '', 'info');
        }

        function editarPrecioCatalogo(id) {
            const x = preciosAdmin.find(p => p.id === id);
            if (!x) return;
            precioEnEdicion = x;
            document.getElementById('preServicio').value = x.servicio;
            document.getElementById('preUnidad').value = x.unidad;
            document.getElementById('preConcepto').value = x.concepto;
            document.getElementById('preN1').value = x.n1 === null ? '' : x.n1;
            document.getElementById('preN2').value = x.n2 === null ? '' : x.n2;
            document.getElementById('preN3').value = x.n3 === null ? '' : x.n3;
            document.getElementById('preNotas').value = x.notas;
            document.getElementById('preMarca').value = x.marca || '';
            document.getElementById('catTituloPre').innerText = categoriaCatalogo() === 'Producto' ? 'Editar producto' : 'Editar servicio';
            document.getElementById('preClave').innerText = x.clave || 'Se asigna al guardar';
            document.getElementById('btnGuardarPrecio').innerText = 'Guardar cambios';
            document.getElementById('catCancelarPre').classList.remove('hidden');
            mensajeCatUI('preMensaje', '', 'info');
        }

        async function guardarPrecioDesdeForm() {
            const concepto = document.getElementById('preConcepto').value.trim();
            if (!concepto) { mensajeCatUI('preMensaje', 'Escribe el concepto o el tipo de equipo.', 'error'); return; }
            let n1 = document.getElementById('preN1').value, n2 = document.getElementById('preN2').value,
                n3 = document.getElementById('preN3').value;
            if (n1 === '' && n2 === '' && n3 === '') { mensajeCatUI('preMensaje', 'Captura al menos el precio de Nivel I.', 'error'); return; }
            // Precio único: el Nivel I se copia a los niveles vacíos
            if (n1 !== '') { if (n2 === '') n2 = n1; if (n3 === '') n3 = n1; }

            const btn = document.getElementById('btnGuardarPrecio');
            btn.disabled = true;
            try {
                const j = await peticionAdmin('guardarPrecio', { precio: {
                    id: precioEnEdicion ? precioEnEdicion.id : '',
                    categoria: categoriaCatalogo(),
                    servicio: document.getElementById('preServicio').value.trim() ||
                              (categoriaCatalogo() === 'Producto' ? 'Refacción' : 'Preventivo'),
                    concepto: concepto,
                    marca: categoriaCatalogo() === 'Producto' ? document.getElementById('preMarca').value.trim() : '',
                    unidad: document.getElementById('preUnidad').value.trim(),
                    n1: n1, n2: n2, n3: n3, moneda: 'MXN',
                    notas: document.getElementById('preNotas').value.trim()
                } });
                await cargarPreciosAdmin();
                await refrescarTarifario();
                limpiarFormPrecio();
                renderPreciosCatalogo();
                const etq = categoriaCatalogo() === 'Producto' ? 'Producto' : 'Servicio';
                mensajeCatUI('preMensaje', (j.nuevo ? etq + ' agregado' : etq + ' actualizado') +
                             (j.clave ? ' · No. de catálogo ' + j.clave : '') + '.', 'ok');
            } catch (err) {
                mensajeCatUI('preMensaje', err.message, 'error');
            } finally { btn.disabled = false; }
        }

        document.getElementById('catListaPrecios').addEventListener('click', async (e) => {
            const ed = e.target.closest('[data-pre-editar]');
            if (ed) { editarPrecioCatalogo(ed.dataset.preEditar); return; }
            const el = e.target.closest('[data-pre-eliminar]');
            if (!el) return;
            const x = preciosAdmin.find(p => p.id === el.dataset.preEliminar);
            if (!x || !(await confirmar('¿Eliminar "' + x.concepto + '" (' + x.servicio + ')? Las facturas y cotizaciones ya emitidas conservan su importe.', { titulo: 'Eliminar concepto', textoSi: 'Eliminar', peligro: true }))) return;
            try {
                await peticionAdmin('eliminarPrecio', { id: x.id });
                await cargarPreciosAdmin();
                await refrescarTarifario();
                if (precioEnEdicion && precioEnEdicion.id === x.id) limpiarFormPrecio();
                renderPreciosCatalogo();
            } catch (err) { avisar(err.message); }
        });
        document.getElementById('catBuscarPre').addEventListener('input', () => renderPreciosCatalogo());
        document.getElementById('catFiltroServ').addEventListener('change', () => renderPreciosCatalogo());

        /* ---------- Alta rápida desde el cotizador ---------- */
        async function guardarClienteDesdeCotizacion() {
            const razon = document.getElementById('cotRazonSocial').value.trim();
            if (!razon) { mensajeCotUI('Escribe al menos la razón social del cliente.', 'error'); return; }
            try {
                const j = await enviarCliente({
                    id: '', razonSocial: razon,
                    rfc: document.getElementById('cotRFC').value.trim().toUpperCase(),
                    direccion: document.getElementById('cotDireccion').value.trim(),
                    atencion: document.getElementById('cotAtencion').value.trim(),
                    correo: '', telefono: '', unidad: '', nivel: document.getElementById('cotNivel').value || 'I', notas: ''
                });
                poblarSelectsCotizador();
                document.getElementById('cotCliente').value = j.id;
                document.getElementById('btnGuardarClienteDesdeCot').classList.add('hidden');
                mensajeCotUI('Cliente agregado al catálogo.', 'ok');
            } catch (err) { mensajeCotUI(err.message, 'error'); }
        }

        /* ============================================================
           v5.5 — FIRMA PREDETERMINADA
           La imagen se prepara en el navegador antes de subirla:
           · se reduce a 600 × 240 px como máximo (de sobra para 62 mm impresos);
           · el fondo blanco o casi blanco se vuelve transparente, para que la
             firma se monte sobre la línea como si fuera tinta;
           · se recorta al trazo, para que no la descentren los márgenes.
           Así una foto de la firma de 3 MB queda en 20–60 KB.
           ============================================================ */
        let firmaCotizacion = '';

        async function cargarFirmaCotizacion() {
            if (!hayBackend()) return;
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ accion: 'firmaCotizacion', token: tokenSesion() })
                });
                const j = await r.json().catch(() => null);
                firmaCotizacion = (j && j.ok && j.firma) ? j.firma : '';
            } catch (_) { /* sin firma: se imprime el espacio en blanco de siempre */ }
            pintarFirmaCotizacion();
        }

        function pintarFirmaCotizacion() {
            const vista = document.getElementById('cotFirmaVista');
            if (!vista) return;
            vista.innerHTML = firmaCotizacion
                ? '<img src="' + firmaCotizacion + '" alt="Firma predeterminada" class="max-h-20 max-w-full object-contain">'
                : 'Sin firma: la cotización sale con el espacio en blanco para firmar a mano.';
            document.getElementById('cotFirmaAcciones').classList.toggle('hidden', !esAdministrador());
            document.getElementById('btnQuitarFirma').classList.toggle('hidden', !firmaCotizacion);
        }

        function mensajeFirmaUI(texto, tipo) {
            const el = document.getElementById('cotFirmaMensaje');
            el.innerText = texto;
            el.className = 'text-xs mt-2 ' + (tipo === 'error' ? 'text-red-600' : 'text-green-700');
            el.classList.toggle('hidden', !texto);
        }

        function prepararImagenFirma(archivo) {
            return new Promise((resolve, reject) => {
                const lector = new FileReader();
                lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
                lector.onload = () => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
                    img.onload = () => {
                        const escala = Math.min(1, 600 / img.width, 240 / img.height);
                        const w = Math.max(1, Math.round(img.width * escala)), h = Math.max(1, Math.round(img.height * escala));
                        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                        const ctx = cv.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        const datos = ctx.getImageData(0, 0, w, h), p = datos.data;
                        let x0 = w, y0 = h, x1 = -1, y1 = -1;
                        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                            const i = (y * w + x) * 4;
                            const luz = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
                            if (p[i + 3] < 20 || luz > 225) { p[i + 3] = 0; continue; }          // fondo → transparente
                            if (luz > 170) p[i + 3] = Math.round(p[i + 3] * (225 - luz) / 55);    // bordes suaves
                            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
                        }
                        if (x1 < 0) { reject(new Error('No se encontró trazo en la imagen. ¿Está en blanco?')); return; }
                        ctx.putImageData(datos, 0, 0);
                        const m = 4;
                        x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
                        const out = document.createElement('canvas');
                        out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
                        out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
                        resolve(out.toDataURL('image/png'));
                    };
                    img.src = lector.result;
                };
                lector.readAsDataURL(archivo);
            });
        }

        document.getElementById('cotFirmaArchivo').addEventListener('change', async (e) => {
            const archivo = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!archivo) return;
            if (!/^image\/(png|jpeg)$/.test(archivo.type)) { mensajeFirmaUI('Usa una imagen PNG o JPG.', 'error'); return; }
            try {
                mensajeFirmaUI('Preparando la imagen…', 'ok');
                const dataUrl = await prepararImagenFirma(archivo);
                if (dataUrl.length > 550000) throw new Error('La firma resultó demasiado grande. Prueba con una imagen más sencilla.');
                await peticionAdmin('guardarFirmaCotizacion', { firma: dataUrl });
                firmaCotizacion = dataUrl;
                pintarFirmaCotizacion();
                mensajeFirmaUI('Firma guardada. Ya sale en las cotizaciones.', 'ok');
                registrarEvento('firma_cotizacion', 'Firma actualizada');
            } catch (err) { mensajeFirmaUI(err.message, 'error'); }
        });

        async function quitarFirmaCotizacion() {
            if (!(await confirmar('¿Quitar la firma predeterminada? Las cotizaciones volverán a salir con el espacio en blanco para firmar a mano.',
                                  { titulo: 'Quitar firma', textoSi: 'Quitar', peligro: true }))) return;
            try {
                await peticionAdmin('guardarFirmaCotizacion', { firma: '' });
                firmaCotizacion = '';
                pintarFirmaCotizacion();
                mensajeFirmaUI('Firma quitada.', 'ok');
            } catch (err) { mensajeFirmaUI(err.message, 'error'); }
        }

        async function cargarDatosCotizador() {
            const leer = async (hoja, procesar) => {
                try {
                    const texto = await descargarHoja(hoja, false);
                    Papa.parse(texto, {
                        header: true, skipEmptyLines: true,
                        transformHeader: h => normalizar(h.trim().toLowerCase()),
                        complete: r => procesar(r.data)
                    });
                } catch (_) { procesar([]); }
            };
            await Promise.all([
                leer('config_cot', procesarConfigCotizacion),
                leer('catalogo_cot', procesarCatalogoCotizacion),
                cargarCatalogoClientes(),                      // v4.9
                cargarFirmaCotizacion()                        // v5.5
            ]);

            if (hayBackend()) {
                try {
                    const r = await fetch(URL_APPS_SCRIPT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ accion: 'listarCotizaciones', token: tokenSesion() })
                    });
                    const j = await r.json().catch(() => null);
                    cotizaciones = (j && j.ok) ? j.cotizaciones : [];
                } catch (_) { cotizaciones = []; }
            }
        }

        async function mostrarCotizador() {
            resetSidebarStyles();
            const btn = document.getElementById('btnCotizador');
            btn.classList.add('border-l-4', 'border-brand-500', 'bg-slate-800/50', 'text-white');
            btn.classList.remove('text-slate-400');
            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'none';
            document.getElementById('adminUsuariosContent').classList.add('hidden');
            document.getElementById('auditoriaContent').classList.add('hidden');
            document.getElementById('catalogosContent').classList.add('hidden');
            document.getElementById('cotizadorContent').classList.remove('hidden');
            cerrarSidebarMovil();
            registrarEvento('ver_cotizador');

            document.getElementById('cotTabla').innerHTML = '<p class="text-sm text-slate-500 italic p-6">Cargando cotizaciones…</p>';
            await cargarDatosCotizador();

            // Aviso si falta configurar lo que va impreso en cada cotización
            const faltan = ['Razón social del emisor', 'RFC del emisor', 'CLABE']
                .filter(k => !valorConfig(k));
            const aviso = document.getElementById('cotAvisoConfig');
            aviso.classList.toggle('hidden', faltan.length === 0 && hayBackend());
            aviso.innerText = !hayBackend()
                ? 'El cotizador requiere el backend de Apps Script: el folio y el guardado ocurren en el servidor.'
                : 'Falta capturar en la pestaña Config_Cotizacion: ' + faltan.join(', ') +
                  '. Las cotizaciones saldrán con ese espacio en blanco hasta que se llene.';

            cerrarFormularioCotizacion();
            renderListaCotizaciones();
        }

        const COLOR_ESTADO = {
            'Emitida':   'bg-slate-100 text-slate-700',
            'Enviada':   'bg-blue-100 text-blue-800',
            'Aceptada':  'bg-green-100 text-green-800',
            'Rechazada': 'bg-red-100 text-red-700',
            'Vencida':   'bg-amber-100 text-amber-800'
        };

        function renderListaCotizaciones() {
            const cont = document.getElementById('cotTabla');
            const texto = normalizar(document.getElementById('cotBuscar').value.toLowerCase()).trim();
            const estado = document.getElementById('cotFiltroEstado').value;

            const lista = cotizaciones.filter(c => {
                if (estado !== 'todos' && c.estado !== estado) return false;
                if (!texto) return true;
                const blob = normalizar((c.folio + ' ' + c.razonSocial + ' ' + c.cliente + ' ' +
                              (c.partidas || []).map(p => (p.clave || '') + ' ' + p.descripcion).join(' ')).toLowerCase());
                return blob.includes(texto);
            }).sort((a, b) => (parseInt(b.folio, 10) || 0) - (parseInt(a.folio, 10) || 0));

            if (lista.length === 0) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic p-6">' +
                    (cotizaciones.length ? 'Ninguna cotización coincide con el filtro.' : 'Todavía no hay cotizaciones registradas.') + '</p>';
                return;
            }
            const th = 'px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider';
            cont.innerHTML =
                '<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50"><tr>' +
                    '<th class="' + th + '">Folio</th><th class="' + th + '">Fecha</th><th class="' + th + '">Cliente</th>' +
                    '<th class="' + th + '">Partidas</th><th class="' + th + ' text-right">Total</th>' +
                    '<th class="' + th + '">Estado</th><th class="' + th + ' text-right">Acciones</th>' +
                '</tr></thead><tbody class="divide-y divide-slate-100 bg-white text-sm">' +
                lista.map(c =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="px-4 py-3 font-bold text-red-600">' + esc(c.folio) + '</td>' +
                        '<td class="px-4 py-3 text-slate-600 whitespace-nowrap">' + esc(fechaLargaCot(c.fecha)) + '</td>' +
                        '<td class="px-4 py-3 text-slate-800">' + esc(c.razonSocial || c.cliente) + '</td>' +
                        '<td class="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">' +
                            esc((c.partidas || []).map(p => p.descripcion).join(' · ')) + '</td>' +
                        '<td class="px-4 py-3 text-right font-semibold">' + fmtMoneda(c.total, 'MXN') + '</td>' +
                        '<td class="px-4 py-3"><select data-cot-estado="' + esc(c.folio) + '" class="text-xs font-bold rounded-full px-2 py-1 border-0 ' +
                            (COLOR_ESTADO[c.estado] || COLOR_ESTADO.Emitida) + '">' +
                            ['Emitida', 'Enviada', 'Aceptada', 'Rechazada', 'Vencida'].map(e =>
                                '<option' + (e === c.estado ? ' selected' : '') + '>' + e + '</option>').join('') +
                        '</select></td>' +
                        '<td class="px-4 py-3 text-right whitespace-nowrap">' +
                            '<button data-cot-accion="imprimir" data-folio="' + esc(c.folio) + '" class="text-xs font-semibold text-brand-600 hover:text-brand-800 px-2">Imprimir</button>' +
                            '<button data-cot-accion="correo" data-folio="' + esc(c.folio) + '" class="text-xs font-semibold text-green-700 hover:text-green-900 px-2">Correo</button>' +
                            '<button data-cot-accion="editar" data-folio="' + esc(c.folio) + '" class="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2">Editar</button>' +
                            '<button data-cot-accion="duplicar" data-folio="' + esc(c.folio) + '" class="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2">Duplicar</button>' +
                        '</td>' +
                    '</tr>').join('') +
                '</tbody></table>';
        }

        // "2026-07-02" → "2 de julio de 2026", como en el formato
        function fechaLargaCot(iso) {
            if (!iso) return '';
            const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
            if (!m) return String(iso);
            return parseInt(m[3], 10) + ' de ' + MESES_ES[parseInt(m[2], 10) - 1] + ' de ' + m[1];
        }

        function sumarDias(iso, dias) {
            const d = new Date(iso + 'T12:00:00');
            d.setDate(d.getDate() + dias);
            return d.toISOString().slice(0, 10);
        }

        function poblarSelectsCotizador() {
            /* v4.9: los clientes salen del catálogo, no de los nombres de unidad.
               Esta función también se llama al cambiar de nivel, para rotular
               los precios del catálogo; por eso se CONSERVA el cliente elegido.
               Sin eso, elegir un cliente cambiaba el nivel, el nivel
               reconstruía el selector y la cotización se guardaba sin cliente. */
            const selCli = document.getElementById('cotCliente');
            const clienteElegido = selCli.value;
            selCli.innerHTML = '<option value="">— Capturar a mano —</option>' +
                catalogoClientes.map(c => '<option value="' + esc(c.id) + '">' + esc(c.razonSocial) +
                    (c.rfc ? ' · ' + esc(c.rfc) : '') + '</option>').join('');
            if (clienteElegido && catalogoClientes.some(c => c.id === clienteElegido)) selCli.value = clienteElegido;

            // v4.8: el catálogo sale de la hoja única, agrupado por tipo
            catalogoCotizacion = conceptosDelCotizador();
            const nivel = document.getElementById('cotNivel').value || 'I';
            const grupos = {};
            catalogoCotizacion.forEach((c, i) => { (grupos[c.grupo] = grupos[c.grupo] || []).push(i); });
            const selCat = document.getElementById('cotCatalogo');
            selCat.innerHTML = '<option value="">Partida libre</option>' +
                Object.keys(grupos).map(g =>
                    '<optgroup label="' + esc(g) + '">' +
                    grupos[g].map(i => {
                        const c = catalogoCotizacion[i];
                        const pr = precioConcepto(c, nivel);
                        return '<option value="' + i + '">' + (c.clave ? esc(c.clave) + ' · ' : '') + esc(c.descripcion) +
                               (pr ? ' — ' + fmtMoneda(pr, 'MXN') : '') + '</option>';
                    }).join('') + '</optgroup>').join('');
        }

        function abrirFormulario(c, esDuplicado) {
            document.getElementById('cotNivel').value = (c && c.nivel) || 'I';
            poblarSelectsCotizador();
            cotizacionEnEdicion = (c && !esDuplicado) ? c : null;

            document.getElementById('cotTituloForm').innerText =
                cotizacionEnEdicion ? 'Editar cotización' : (esDuplicado ? 'Nueva cotización (a partir de ' + c.folio + ')' : 'Nueva cotización');
            document.getElementById('cotFolioForm').innerText =
                cotizacionEnEdicion ? 'Folio ' + c.folio : 'El folio se asigna al guardar';

            /* v4.9: se busca al cliente en el catálogo por su id y, para las
               cotizaciones anteriores a la 4.9, por RFC o razón social. */
            const enCat = c ? (catalogoClientes.find(x => x.id === c.clienteId) ||
                               catalogoClientes.find(x => c.rfc && x.rfc === c.rfc) ||
                               catalogoClientes.find(x => x.razonSocial === c.razonSocial)) : null;
            document.getElementById('cotCliente').value = enCat ? enCat.id : '';
            actualizarBotonAltaCliente();
            document.getElementById('cotRazonSocial').value = (c && c.razonSocial) || '';
            document.getElementById('cotDireccion').value = (c && c.direccion) || '';
            document.getElementById('cotRFC').value = (c && c.rfc) || '';
            document.getElementById('cotAtencion').value = (c && c.atencion) || '';
            document.getElementById('cotCondiciones').value = (c && c.condiciones) || 'CRÉDITO';
            document.getElementById('cotFecha').value = (cotizacionEnEdicion && c.fecha) || new Date().toISOString().slice(0, 10);
            document.getElementById('cotObservaciones').value = (c && c.observaciones) || valorConfig('Observaciones');
            // v4.8: cada cotización conserva sus propios textos
            document.getElementById('cotCondImportantes').value = (c && c.condicionesImportantes) || valorConfig('Condiciones importantes');
            document.getElementById('cotGarantia').value = (c && c.garantia) || valorConfig('Garantía');
            document.getElementById('cotNivel').value = (c && c.nivel) || 'I';
            document.getElementById('btnTextosDefault').classList.toggle('hidden', !esAdministrador());
            pintarFirmaCotizacion();   // v5.5

            partidasCot = c ? (c.partidas || []).map(p => ({ ...p })) : [];
            renderPartidas();
            mensajeCotUI('', 'info');

            document.getElementById('cotLista').classList.add('hidden');
            document.getElementById('cotFormulario').classList.remove('hidden');
        }

        function nuevaCotizacion() { abrirFormulario(null, false); }

        function cerrarFormularioCotizacion() {
            document.getElementById('cotFormulario').classList.add('hidden');
            document.getElementById('cotLista').classList.remove('hidden');
            cotizacionEnEdicion = null;
            partidasCot = [];
        }

        /* Al elegir una unidad se prellenan sus datos fiscales con los de su
           cotización más reciente: no hay otro lugar de donde tomar el RFC. */
        /* v4.9 — Elegir un cliente del catálogo llena sus datos fiscales y
           aplica su NIVEL de convenio, lo que reprecia las partidas del
           catálogo que no se hayan corregido a mano. */
        document.getElementById('cotCliente').addEventListener('change', (e) => {
            const c = catalogoClientes.find(x => x.id === e.target.value);
            if (c) {
                document.getElementById('cotRazonSocial').value = c.razonSocial;
                document.getElementById('cotDireccion').value = c.direccion;
                document.getElementById('cotRFC').value = c.rfc;
                document.getElementById('cotAtencion').value = c.atencion;
                const selNivel = document.getElementById('cotNivel');
                if (c.nivel && selNivel.value !== c.nivel) {
                    selNivel.value = c.nivel;
                    selNivel.dispatchEvent(new Event('change'));
                }
            }
            actualizarBotonAltaCliente();
        });

        // El alta rápida solo se ofrece al administrador y si el cliente no está
        function actualizarBotonAltaCliente() {
            const btn = document.getElementById('btnGuardarClienteDesdeCot');
            if (!btn) return;
            const sinCatalogo = !document.getElementById('cotCliente').value;
            btn.classList.toggle('hidden', !(sinCatalogo && esAdministrador() && hayBackend()));
        }

        /* v4.8 — Al cambiar el nivel se reprecian las partidas que vinieron del
           catálogo y cuyo precio NO se tocó a mano. Lo corregido a mano manda. */
        document.getElementById('cotNivel').addEventListener('change', () => {
            const nivel = document.getElementById('cotNivel').value;
            let repreciadas = 0;
            partidasCot.forEach(p => {
                if (p.tocado) return;
                const base = conceptoDePartida(p);
                if (!base) return;
                p.precio = precioConcepto(base, nivel);
                repreciadas++;
            });
            poblarSelectsCotizador();
            renderPartidas();
            if (repreciadas) mensajeCotUI(repreciadas + ' partida(s) del catálogo se repreciaron al Nivel ' + nivel +
                                          '. Las que corregiste a mano conservan su precio.', 'info');
        });

        function restablecerTextosCot() {
            document.getElementById('cotObservaciones').value = valorConfig('Observaciones');
            document.getElementById('cotCondImportantes').value = valorConfig('Condiciones importantes');
            document.getElementById('cotGarantia').value = valorConfig('Garantía');
            mensajeCotUI('Textos restablecidos a los predeterminados.', 'info');
        }

        /* Cambia los predeterminados para TODAS las cotizaciones nuevas. Solo el
           administrador, y el servidor vuelve a verificarlo. Las cotizaciones ya
           emitidas no cambian: cada una guardó su propia copia del texto. */
        async function guardarTextosComoDefault() {
            if (!esAdministrador()) return;
            if (!(await confirmar('¿Usar estos textos como predeterminados para todas las cotizaciones nuevas? ' +
                         'Las ya emitidas conservan el texto con que salieron.', { textoSi: 'Usar como predeterminados' }))) return;
            try {
                const j = await peticionAdmin('guardarTextosCotizacion', {
                    textos: {
                        'Observaciones': document.getElementById('cotObservaciones').value,
                        'Condiciones importantes': document.getElementById('cotCondImportantes').value,
                        'Garantía': document.getElementById('cotGarantia').value
                    }
                });
                configCotizacion['Observaciones'] = document.getElementById('cotObservaciones').value;
                configCotizacion['Condiciones importantes'] = document.getElementById('cotCondImportantes').value;
                configCotizacion['Garantía'] = document.getElementById('cotGarantia').value;
                try { sessionStorage.removeItem('ia_csv_config_cot'); } catch (_) {}
                registrarEvento('textos_cotizacion', 'Actualizó los textos predeterminados');
                mensajeCotUI('Textos guardados como predeterminados (' + (j.cambiados || []).join(', ') + ').', 'ok');
            } catch (err) {
                mensajeCotUI(err.message, 'error');
            }
        }

        function agregarPartida() {
            const idx = document.getElementById('cotCatalogo').value;
            const base = idx === '' ? null : catalogoCotizacion[parseInt(idx, 10)];
            const nivel = document.getElementById('cotNivel').value || 'I';
            partidasCot.push({
                descripcion: base ? base.descripcion : '',
                unidad: base ? base.unidad : 'Pieza',
                cantidad: 1,
                precio: base ? precioConcepto(base, nivel) : 0,
                // v4.8: se recuerda de qué concepto vino, para repreciar al cambiar de nivel
                origen: base ? idx : null,
                clave: base ? (base.clave || '') : '',   // v5.0
                tocado: false
            });
            renderPartidas();
            setTimeout(() => {
                const campos = document.querySelectorAll('#cotPartidas [data-p-campo="descripcion"]');
                if (campos.length) campos[campos.length - 1].focus();
            }, 30);
        }

        function totalesCotizacion() {
            const iva = parseFloat(valorConfig('IVA', '0.16')) || 0.16;
            const subtotal = redondear(partidasCot.reduce((a, p) => a + (Number(p.cantidad) || 0) * (Number(p.precio) || 0), 0));
            const impIva = redondear(subtotal * iva);
            return { subtotal: subtotal, iva: impIva, total: redondear(subtotal + impIva), tasa: iva };
        }

        function renderPartidas() {
            const cont = document.getElementById('cotPartidas');
            if (partidasCot.length === 0) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic px-5 py-6">Agrega una partida del catálogo o una partida libre.</p>';
            } else {
                const inp = 'w-full p-1.5 border border-slate-300 rounded text-sm outline-none focus:border-brand-500';
                cont.innerHTML = '<table class="min-w-full text-sm"><thead class="bg-slate-50"><tr class="text-xs uppercase tracking-wide text-slate-500">' +
                    '<th class="px-3 py-2 text-left whitespace-nowrap">No. cat.</th>' +
                    '<th class="px-3 py-2 text-left w-1/2">Descripción</th><th class="px-3 py-2 text-left">Unidad</th>' +
                    '<th class="px-3 py-2 text-right">Cantidad</th><th class="px-3 py-2 text-right">Precio</th>' +
                    '<th class="px-3 py-2 text-right">Importe</th><th></th></tr></thead><tbody>' +
                    partidasCot.map((p, i) =>
                        '<tr class="border-t border-slate-100 align-top">' +
                            '<td class="px-3 py-3 font-mono text-xs whitespace-nowrap ' + (p.clave ? 'text-slate-700' : 'text-slate-400') +
                                '" title="' + (p.clave ? 'Número de catálogo del concepto' : 'Partida libre, sin concepto del catálogo') + '">' +
                                (p.clave ? esc(p.clave) : '—') + '</td>' +
                            '<td class="px-3 py-2"><textarea rows="2" data-p="' + i + '" data-p-campo="descripcion" class="' + inp + '">' + esc(p.descripcion) + '</textarea></td>' +
                            '<td class="px-3 py-2"><input data-p="' + i + '" data-p-campo="unidad" value="' + esc(p.unidad) + '" class="' + inp + ' w-24"></td>' +
                            '<td class="px-3 py-2"><input type="number" min="0" step="1" data-p="' + i + '" data-p-campo="cantidad" value="' + p.cantidad + '" class="' + inp + ' w-20 text-right"></td>' +
                            '<td class="px-3 py-2"><input type="number" min="0" step="0.01" data-p="' + i + '" data-p-campo="precio" value="' + p.precio + '" class="' + inp + ' w-28 text-right"></td>' +
                            '<td class="px-3 py-2 text-right font-semibold whitespace-nowrap" data-p-importe="' + i + '">' +
                                fmtMoneda((Number(p.cantidad) || 0) * (Number(p.precio) || 0), 'MXN') + '</td>' +
                            '<td class="px-3 py-2"><button data-p-quitar="' + i + '" class="text-xs font-semibold text-red-500 hover:text-red-700">Quitar</button></td>' +
                        '</tr>').join('') +
                    '</tbody></table>';
            }
            renderTotalesCot();
        }

        function renderTotalesCot() {
            const t = totalesCotizacion();
            document.getElementById('cotTotales').innerHTML =
                '<p><span class="text-slate-500">Subtotal</span> <span class="font-semibold ml-4">' + fmtMoneda(t.subtotal, 'MXN') + '</span></p>' +
                '<p><span class="text-slate-500">I.V.A. ' + Math.round(t.tasa * 100) + '%</span> <span class="font-semibold ml-4">' + fmtMoneda(t.iva, 'MXN') + '</span></p>' +
                '<p class="text-base"><span class="font-bold">Total</span> <span class="font-bold ml-4">' + fmtMoneda(t.total, 'MXN') + '</span></p>' +
                '<p class="text-xs text-slate-500 mt-1">(' + esc(numeroALetras(t.total)) + ')</p>';
        }

        document.getElementById('cotPartidas').addEventListener('input', (e) => {
            const el = e.target.closest('[data-p]');
            if (!el) return;
            const i = parseInt(el.dataset.p, 10);
            const campo = el.dataset.pCampo;
            partidasCot[i][campo] = (campo === 'cantidad' || campo === 'precio') ? (parseFloat(el.value) || 0) : el.value;
            if (campo === 'precio') partidasCot[i].tocado = true;
            const celda = document.querySelector('[data-p-importe="' + i + '"]');
            if (celda) celda.innerText = fmtMoneda((Number(partidasCot[i].cantidad) || 0) * (Number(partidasCot[i].precio) || 0), 'MXN');
            renderTotalesCot();
        });

        document.getElementById('cotPartidas').addEventListener('click', (e) => {
            const b = e.target.closest('[data-p-quitar]');
            if (!b) return;
            partidasCot.splice(parseInt(b.dataset.pQuitar, 10), 1);
            renderPartidas();
        });

        function mensajeCotUI(texto, tipo) {
            const el = document.getElementById('cotMensaje');
            const estilos = { error: 'bg-red-50 text-red-700 border border-red-200',
                              ok: 'bg-green-50 text-green-700 border border-green-200',
                              info: 'bg-slate-100 text-slate-600 border border-slate-200' };
            el.className = 'text-xs rounded-lg p-3 mb-4 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        async function guardarCotizacionDesdeForm(imprimirAlTerminar) {
            const partidas = partidasCot.filter(p => String(p.descripcion).trim());
            const razon = document.getElementById('cotRazonSocial').value.trim();
            if (!razon) { mensajeCotUI('Escribe la razón social del cliente.', 'error'); return; }
            if (partidas.length === 0) { mensajeCotUI('Agrega al menos una partida con descripción.', 'error'); return; }
            if (partidas.some(p => !(Number(p.precio) > 0))) {
                if (!(await confirmar('Hay partidas con precio en cero. ¿Guardar de todos modos?', { textoSi: 'Guardar así' }))) return;
            }
            if (!hayBackend()) { mensajeCotUI('El cotizador requiere el backend de Apps Script configurado.', 'error'); return; }

            partidasCot = partidas;
            const t = totalesCotizacion();
            const fecha = document.getElementById('cotFecha').value || new Date().toISOString().slice(0, 10);
            const vigenciaDias = parseInt(valorConfig('Vigencia en días', '20'), 10) || 20;

            const cot = {
                folio: cotizacionEnEdicion ? cotizacionEnEdicion.folio : '',
                fecha: fecha,
                vigencia: sumarDias(fecha, vigenciaDias),
                // v4.9: se guarda la unidad del cliente (enlace con sus órdenes) y su id
                cliente: (() => {
                    const c = catalogoClientes.find(x => x.id === document.getElementById('cotCliente').value);
                    return c ? (c.unidad || c.razonSocial) : '';
                })(),
                clienteId: document.getElementById('cotCliente').value,
                razonSocial: razon,
                direccion: document.getElementById('cotDireccion').value.trim(),
                rfc: document.getElementById('cotRFC').value.trim().toUpperCase(),
                atencion: document.getElementById('cotAtencion').value.trim(),
                condiciones: document.getElementById('cotCondiciones').value,
                partidas: partidas.map(p => ({ clave: p.clave || '', descripcion: String(p.descripcion).trim(), unidad: p.unidad,
                                               cantidad: Number(p.cantidad) || 0, precio: Number(p.precio) || 0,
                                               origen: (p.origen === undefined ? null : p.origen), tocado: !!p.tocado })),
                subtotal: t.subtotal, iva: t.iva, total: t.total,
                observaciones: document.getElementById('cotObservaciones').value,
                condicionesImportantes: document.getElementById('cotCondImportantes').value,
                garantia: document.getElementById('cotGarantia').value,
                nivel: document.getElementById('cotNivel').value
            };

            const botones = [document.getElementById('btnGuardarCot'), document.getElementById('btnGuardarImprimirCot'),
                             document.getElementById('btnGuardarCorreoCot')];
            botones.forEach(b => b.disabled = true);
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ accion: 'guardarCotizacion', token: tokenSesion(),
                                           usuario: nombreUsuario(), cotizacion: cot })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo guardar la cotización.');

                cot.folio = j.folio;
                cot.estado = cotizacionEnEdicion ? cotizacionEnEdicion.estado : 'Emitida';
                registrarEvento(j.nueva ? 'cotizacion_emitida' : 'cotizacion_actualizada',
                                'Folio ' + j.folio + ' · ' + razon + ' · ' + fmtMoneda(t.total, 'MXN'));

                await cargarDatosCotizador();
                cerrarFormularioCotizacion();
                renderListaCotizaciones();
                mostrarAviso((j.nueva ? 'Cotización emitida con folio ' : 'Cotización actualizada, folio ') + j.folio + '.');
                if (imprimirAlTerminar === 'correo') abrirCorreoCotizacion(cot);
                else if (imprimirAlTerminar) imprimirCotizacion(cot);
            } catch (err) {
                mensajeCotUI(err.message, 'error');
            } finally {
                botones.forEach(b => b.disabled = false);
            }
        }

        document.getElementById('cotTabla').addEventListener('click', (e) => {
            const b = e.target.closest('[data-cot-accion]');
            if (!b) return;
            const c = cotizaciones.find(x => x.folio === b.dataset.folio);
            if (!c) return;
            const acc = b.dataset.cotAccion;
            if (acc === 'imprimir') imprimirCotizacion(c);
            else if (acc === 'correo') abrirCorreoCotizacion(c);
            else if (acc === 'editar') abrirFormulario(c, false);
            else if (acc === 'duplicar') abrirFormulario(c, true);
        });

        document.getElementById('cotTabla').addEventListener('change', async (e) => {
            const sel = e.target.closest('[data-cot-estado]');
            if (!sel) return;
            const folio = sel.dataset.cotEstado;
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ accion: 'cambiarEstadoCotizacion', token: tokenSesion(),
                                           usuario: nombreUsuario(), folio: folio, estado: sel.value })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo cambiar el estado.');
                const c = cotizaciones.find(x => x.folio === folio);
                if (c) c.estado = sel.value;
                renderListaCotizaciones();
            } catch (err) {
                avisar(err.message);
                renderListaCotizaciones();
            }
        });

        document.getElementById('cotBuscar').addEventListener('input', () => renderListaCotizaciones());
        document.getElementById('cotFiltroEstado').addEventListener('change', renderListaCotizaciones);

        /* ---------- Formato impreso ----------
           v4.8 — PAGINACIÓN MEDIDA

           En la 4.7 la primera hoja era un solo recuadro con un espacio fijo
           para las partidas. Con más de cuatro o cinco partidas largas el
           recuadro no cabía en la hoja: el navegador lo partía, y los totales y
           las observaciones caían sueltos en la hoja siguiente, sin encabezado.

           Ahora cada hoja tiene la altura exacta de una hoja carta y NUNCA se
           parte. Las partidas se reparten midiéndolas de verdad: se arma la
           hoja en un contenedor invisible con el ancho de impresión, se agrega
           una partida a la vez y, si ya no cabe, pasa completa a la hoja
           siguiente, que repite el encabezado. Los totales, el importe con
           letra y las observaciones van juntos en la última hoja de partidas;
           si no caben ahí, pasan juntos a una hoja propia.

           La hoja de condiciones se mide igual: si los textos editados son
           largos, se reduce la letra poco a poco hasta que quepan completos.
           ============================================================ */
        const COT_ANCHO_MM = 191;     // carta 215.9 mm menos 12 + 12 de margen
        const COT_ALTO_MM  = 254;     // carta 279.4 mm menos 10 + 12, con holgura

        /* v5.2 — Las hojas de la cotización se arman aparte para usarlas en dos
           salidas: la impresión (imprimirCotizacion) y el PDF que se adjunta
           al correo (pdfCotizacionBase64). Así el adjunto es idéntico a lo
           impreso. */
        function armarHojasCotizacion(c) {
            const logo = (document.getElementById('logoInstitucional') || {}).src || '';
            const B = 'border:0.35mm solid #000;';
            const lineas = (t) => esc(String(t || '')).split('\n').filter(x => x.trim()).map(x => x + '<br>').join('');
            const telefono = valorConfig('Teléfono'), correo = valorConfig('Correo'), sitio = valorConfig('Sitio web');
            const tasa = Math.round((parseFloat(valorConfig('IVA', '0.16')) || 0.16) * 100);
            const textoCond = c.condicionesImportantes || valorConfig('Condiciones importantes');
            const textoGar = c.garantia || valorConfig('Garantía');

            const celdaEt = (et, val) =>
                '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8pt;">' + et + '</td></tr>' +
                '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8.5pt;font-weight:700;">' + val + '</td></tr>';

            const pie = (n, total) =>
                '<div style="text-align:center;font-size:7.5pt;font-style:italic;color:#1f3a8a;padding-top:2mm">' +
                (telefono ? 'Teléfono oficina: ' + esc(telefono) + '&nbsp;&nbsp;&nbsp;' : '') +
                (correo ? 'Correo electrónico: ' + esc(correo) + '&nbsp;&nbsp;&nbsp;' : '') +
                (sitio ? '¡Visítanos en ' + esc(sitio) + '!' : '') +
                '<br>Hoja ' + n + ' de ' + total + '</div>';

            const encabezado = () =>
                '<p style="text-align:right;font-weight:700;font-size:11pt;margin:0 0 1.5mm">COTIZACIÓN</p>' +
                '<table style="width:100%;border-collapse:separate;border-spacing:1.5mm 0"><tr>' +
                  '<td style="width:37%;vertical-align:top">' +
                    (logo ? '<img src="' + logo + '" style="width:100%;max-height:24mm;object-fit:contain;display:block;margin-bottom:1.5mm">' : '') +
                    '<table style="width:100%;border-collapse:collapse">' +
                      '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8pt;font-weight:700">RAZÓN SOCIAL:</td></tr>' +
                      '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8pt">' + esc(valorConfig('Razón social del emisor')) + '</td></tr>' +
                      '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8pt"><b>R.F.C. :</b> ' + esc(valorConfig('RFC del emisor')) + '</td></tr>' +
                    '</table>' +
                  '</td>' +
                  '<td style="width:39%;vertical-align:top;' + B + 'padding:1.5mm 2mm;font-size:8pt;line-height:1.35">' +
                    '<b>CLIENTE</b><br>' + esc(c.razonSocial) + '<br>' +
                    (c.direccion ? '<b>DIRECCIÓN:</b> ' + esc(c.direccion) + '<br>' : '') +
                    (c.rfc ? '<b>R.F.C.:</b> ' + esc(c.rfc) + '<br>' : '') +
                    (c.atencion ? '<b>ATENCIÓN A</b>: ' + esc(c.atencion) : '') +
                  '</td>' +
                  '<td style="width:24%;vertical-align:top"><table style="width:100%;border-collapse:collapse">' +
                    celdaEt('FOLIO', '<span style="color:#dc2626;font-size:10.5pt">' + esc(c.folio) + '</span>') +
                    celdaEt('FECHA', '<span style="font-weight:400">' + esc(fechaLargaCot(c.fecha)) + '</span>') +
                    celdaEt('VIGENCIA', '<span style="font-weight:400">' + esc(fechaLargaCot(c.vigencia)) + '</span>') +
                    celdaEt('CONDICIONES', esc(c.condiciones)) +
                  '</table></td>' +
                '</tr></table>';

            // v5.0: la columna de número de catálogo solo aparece si alguna partida
            // lo trae; así las cotizaciones anteriores se reimprimen igual que salieron.
            const conClave = (c.partidas || []).some(p => p.clave);
            const filaPartida = (p) =>
                '<tr style="break-inside:avoid">' +
                  (conClave ? '<td style="padding:1.5mm 2mm;font-size:8pt;vertical-align:top;white-space:nowrap;font-family:\'Courier New\',monospace">' +
                              (p.clave ? esc(p.clave) : '') + '</td>' : '') +
                  '<td style="padding:1.5mm 2mm;font-size:8.5pt;vertical-align:top;">' + esc(p.descripcion) + '</td>' +
                  '<td style="padding:1.5mm 2mm;font-size:8.5pt;text-align:center;vertical-align:top;">' + esc(p.unidad) + '</td>' +
                  '<td style="padding:1.5mm 2mm;font-size:8.5pt;text-align:center;vertical-align:top;">' + (Number(p.cantidad) || 0) + '</td>' +
                  '<td style="padding:1.5mm 2mm;font-size:8.5pt;text-align:right;vertical-align:top;white-space:nowrap">' + fmtMoneda(p.precio, 'MXN') + '</td>' +
                  '<td style="padding:1.5mm 2mm;font-size:8.5pt;text-align:right;vertical-align:top;white-space:nowrap">' +
                    fmtMoneda((Number(p.cantidad) || 0) * (Number(p.precio) || 0), 'MXN') + '</td>' +
                '</tr>';

            const tablaPartidas = (lista, continua) =>
                '<table style="width:100%;border-collapse:collapse;margin-top:2mm">' +
                  '<thead><tr>' +
                    (conClave ? ['NO. CAT.'] : []).concat(['DESCRIPCIÓN', 'UNIDAD', 'UNIDADES', 'PRECIO', 'IMPORTE']).map(h =>
                      '<th style="' + B + 'padding:0.8mm 2mm;font-size:8pt;font-weight:400;text-align:left;' +
                      (h === 'DESCRIPCIÓN' ? 'width:' + (conClave ? '44%' : '50%') : '') + (h === 'NO. CAT.' ? 'white-space:nowrap' : '') +
                      '">' + h + '</th>').join('') +
                  '</tr></thead><tbody>' +
                  (continua ? '<tr><td colspan="' + (conClave ? 6 : 5) + '" style="font-size:7.5pt;font-style:italic;color:#475569;padding:1mm 2mm">… continúa de la hoja anterior</td></tr>' : '') +
                  lista.map(filaPartida).join('') +
                '</tbody></table>';

            const cierre = () =>
                '<div style="break-inside:avoid">' +
                  '<table style="margin-left:auto;font-size:9.5pt;margin-top:2mm">' +
                    '<tr><td style="padding:0.4mm 4mm">SUBTOTAL</td><td>$</td><td style="text-align:right;padding-left:10mm">' + fmtMoneda(c.subtotal, 'MXN').replace('$', '') + '</td></tr>' +
                    '<tr><td style="padding:0.4mm 4mm">I.V.A. ' + tasa + '%</td><td>$</td><td style="text-align:right;padding-left:10mm">' + fmtMoneda(c.iva, 'MXN').replace('$', '') + '</td></tr>' +
                    '<tr><td style="padding:0.4mm 4mm">TOTAL</td><td><b>$</b></td><td style="text-align:right;padding-left:10mm"><b>' + fmtMoneda(c.total, 'MXN').replace('$', '') + '</b></td></tr>' +
                  '</table>' +
                  '<p style="font-size:7.5pt;font-weight:700;margin:2mm 0">IMPORTE TOTAL DE LA PROPUESTA: &nbsp; $ &nbsp;' +
                    fmtMoneda(c.total, 'MXN').replace('$', '') + ' &nbsp; ( ' + esc(numeroALetras(c.total)) + ')</p>' +
                  '<table style="width:100%;border-collapse:collapse">' +
                    '<tr><td style="' + B + 'padding:0.8mm 2mm;font-size:8.5pt;font-weight:700;color:#dc2626">OBSERVACIONES:</td></tr>' +
                    '<tr><td style="' + B + 'padding:1.5mm 2mm;font-size:7.8pt;font-weight:700;min-height:12mm;vertical-align:top">' +
                      (lineas(c.observaciones) || '&nbsp;') + '</td></tr>' +
                  '</table>' +
                '</div>';

            /* Hoja de partidas: altura fija. El recuadro ocupa la hoja entera y
               el cierre se empuja al fondo, como en el formato original. */
            const hojaPartidas = (lista, conCierre, continua, n, total) =>
                '<div class="cot-hoja" style="font-family:Arial,Helvetica,sans-serif;color:#000;box-sizing:border-box;' +
                  'width:' + COT_ANCHO_MM + 'mm;height:' + COT_ALTO_MM + 'mm;overflow:hidden;display:flex;flex-direction:column;">' +
                  '<div style="' + B + 'padding:2.5mm;box-sizing:border-box;flex:1;display:flex;flex-direction:column;min-height:0">' +
                    encabezado() +
                    '<div style="flex:1;min-height:0">' + tablaPartidas(lista, continua) + '</div>' +
                    (conCierre ? cierre() : '<p style="text-align:right;font-size:7.5pt;font-style:italic;color:#475569;margin:1mm 0 0">continúa en la hoja siguiente…</p>') +
                  '</div>' +
                  pie(n, total) +
                '</div>';

            const marcas = valorConfig('Marcas');
            const hojaCondiciones = (n, total, escala) =>
                '<div class="cot-hoja" style="font-family:Arial,Helvetica,sans-serif;color:#000;box-sizing:border-box;' +
                  'width:' + COT_ANCHO_MM + 'mm;height:' + COT_ALTO_MM + 'mm;overflow:hidden;display:flex;flex-direction:column;' +
                  'font-size:' + (8 * escala).toFixed(2) + 'pt;padding:2mm">' +
                  '<div style="flex:1;min-height:0">' +
                  (marcas ? '<p style="text-align:center;font-weight:700;font-size:1.45em;text-decoration:underline;margin:0 0 2.5mm">' +
                            'CONTAMOS CON LOS CURSOS Y LAS REFACCIONES ORIGINALES PARA OFRECER SOLUCIONES EN LAS SIGUIENTES MARCAS.</p>' +
                            '<p style="text-align:center;font-size:1.2em;font-weight:700;color:#1f3a8a;line-height:1.6;margin:0 0 4mm">' +
                            esc(marcas).split(',').map(x => x.trim()).filter(Boolean).join(' &nbsp;·&nbsp; ') + '</p>' : '') +
                  '<p style="font-weight:700;color:#dc2626;margin:0 0 2mm">CONDICIONES IMPORTANTES</p>' +
                  '<div style="line-height:1.5;margin-bottom:4mm">' + lineas(textoCond) + '</div>' +
                  (textoGar ? '<div style="' + B + 'padding:2mm;font-size:0.95em;line-height:1.4;margin-bottom:5mm"><b>GARANTÍA</b>: ' +
                    lineas(textoGar).replace(/<br>$/, '') + '</div>' : '') +
                  '<p style="text-align:center;font-size:1.1em;margin:0">Atentamente</p>' +
                  // v5.5: firma predeterminada sobre la línea, si existe
                  (firmaCotizacion
                    ? '<div style="height:16mm;display:flex;align-items:flex-end;justify-content:center;margin-bottom:-2mm">' +
                      '<img src="' + firmaCotizacion + '" alt="Firma" style="max-height:18mm;max-width:62mm;object-fit:contain"></div>'
                    : '<div style="height:14mm"></div>') +
                  '<p style="text-align:center;font-size:1.1em;margin:0 0 4mm;border-top:0.3mm solid #000;width:70mm;margin-left:auto;margin-right:auto;padding-top:1mm">' +
                    esc(valorConfig('Firma (nombre)')) + '</p>' +
                  '<table style="width:100%;border-collapse:collapse;font-size:1.05em;break-inside:avoid"><tr>' +
                    '<td style="' + B + 'padding:2mm;width:42%;vertical-align:top;line-height:1.5">' +
                      '<b><u>DATOS BANCARIOS</u></b><br>Cuenta en Pesos Mexicanos a nombre de :<br>' +
                      '<b>' + esc(valorConfig('Titular de la cuenta')) + '</b><br>' +
                      '<b>Banco: ' + esc(valorConfig('Banco')) + '</b><br>' +
                      'Número de cuenta: <b>' + esc(valorConfig('Número de cuenta')) + '</b><br>' +
                      'Clabe Interbancaria: <b>' + esc(valorConfig('CLABE')) + '</b>' +
                    '</td>' +
                    '<td style="' + B + 'padding:2mm;vertical-align:top;line-height:1.5">' +
                      '<b>Favor de enviar su comprobante de pago a los siguientes correos:</b><br>' +
                      'Correo Principal: <b>' + esc(correo) + '</b><br><br>' +
                      '<span style="color:#dc2626;font-weight:700">' + esc(valorConfig('Aviso de depósito')) + '</span>' +
                    '</td>' +
                  '</tr></table>' +
                  '</div>' +
                  pie(n, total) +
                '</div>';

            /* ---- Medición: se arma cada hoja en un contenedor invisible con el
               ancho real de impresión y se comprueba si su contenido desborda. */
            const medidor = document.createElement('div');
            medidor.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;width:' + COT_ANCHO_MM + 'mm';
            document.body.appendChild(medidor);

            const desborda = (html) => {
                medidor.innerHTML = html;
                const hoja = medidor.querySelector('.cot-hoja');
                const caja = hoja.firstElementChild;
                // el recuadro interior crece con flex; si su contenido pide más, desborda
                return caja.scrollHeight > caja.clientHeight + 1 || hoja.scrollHeight > hoja.clientHeight + 1;
            };

            const partidas = (c.partidas || []);
            const paginas = [];
            let actual = [];
            partidas.forEach(p => {
                const prueba = actual.concat([p]);
                if (actual.length && desborda(hojaPartidas(prueba, false, paginas.length > 0, 1, 1))) {
                    paginas.push(actual);
                    actual = [p];
                } else {
                    actual = prueba;
                }
            });
            paginas.push(actual);

            // El cierre va en la última hoja de partidas; si no cabe, en una propia
            let cierreAparte = false;
            const ultima = paginas[paginas.length - 1];
            if (desborda(hojaPartidas(ultima, true, paginas.length > 1, 1, 1))) {
                cierreAparte = true;
            }

            // Hoja de condiciones: se reduce la letra hasta que quepa
            let escala = 1;
            while (escala > 0.7 && desborda(hojaCondiciones(1, 1, escala))) escala -= 0.05;

            document.body.removeChild(medidor);

            const totalHojas = paginas.length + (cierreAparte ? 1 : 0) + 1;
            let html = '';
            paginas.forEach((lista, i) => {
                const esUltima = i === paginas.length - 1;
                html += hojaPartidas(lista, esUltima && !cierreAparte, i > 0, i + 1, totalHojas);
            });
            if (cierreAparte) html += hojaPartidas([], true, true, paginas.length + 1, totalHojas);
            html += hojaCondiciones(totalHojas, totalHojas, escala);

            return { html: html, totalHojas: totalHojas };
        }

        function imprimirCotizacion(c) {
            const { html, totalHojas } = armarHojasCotizacion(c);
            const cont = document.getElementById('cotizacionImprimible');
            cont.innerHTML = html;
            cont.classList.remove('hidden');
            document.body.classList.add('printing-cotizacion');
            registrarEvento('imprimir_cotizacion', 'Folio ' + c.folio + ' · ' + totalHojas + ' hoja(s)');

            const limpiar = () => {
                document.body.classList.remove('printing-cotizacion');
                cont.classList.add('hidden');
                cont.innerHTML = '';
                window.removeEventListener('afterprint', limpiar);
            };
            window.addEventListener('afterprint', limpiar);
            setTimeout(() => window.print(), 150);
        }

        /* ============================================================
           v5.2 — ENVÍO DE LA COTIZACIÓN POR CORREO

           Se sale desde la lista (botón Correo) o desde el formulario
           (Guardar y enviar por correo, que primero guarda para tener folio).

           · Para: el correo del cliente en el catálogo, buscado por su id y,
             si la cotización no lo tiene, por su razón social. Se puede
             corregir o agregar más direcciones.
           · Adjunto: el PDF se genera en el navegador a partir de las mismas
             hojas que se imprimen (jsPDF + html2canvas, que se descargan solo
             la primera vez que se envía y quedan guardadas por el service
             worker). Cada hoja se convierte en imagen y se coloca en una hoja
             carta con los mismos márgenes de la impresión.
           · El envío usa la acción 'correo' del servidor, la misma de los
             seguimientos: sale de la cuenta institucional y queda en la
             bitácora de correos con el folio.
           · Al enviar (no en borrador), la cotización pasa de Emitida a Enviada
             si la casilla está marcada.
           ============================================================ */
        let cotEnCorreo = null;

        function clienteDeCotizacion(c) {
            if (c.clienteId) {
                const x = catalogoClientes.find(k => k.id === c.clienteId);
                if (x) return x;
            }
            const n = normalizar(String(c.razonSocial || '').toLowerCase()).trim();
            return n ? (catalogoClientes.find(k => normalizar(String(k.razonSocial || '').toLowerCase()).trim() === n) || null) : null;
        }

        function nombreArchivoCotizacion(c) {
            const limpio = normalizar(String(c.razonSocial || c.cliente || '')).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
            return 'Cotizacion_' + c.folio + (limpio ? '_' + limpio : '') + '.pdf';
        }

        function textoCorreoCotizacion(c, cli) {
            const saludo = (c.atencion || (cli && cli.atencion)) ? 'Estimado(a) ' + (c.atencion || cli.atencion) + ':' : 'Buen día:';
            return saludo + '\n\n' +
                'Por medio del presente le hacemos llegar la cotización con folio ' + c.folio +
                ', de fecha ' + fechaLargaCot(c.fecha) + ', por un importe total de ' + fmtMoneda(c.total, 'MXN') +
                ' (I.V.A. incluido).\n\n' +
                (c.vigencia ? 'La propuesta tiene vigencia al ' + fechaLargaCot(c.vigencia) + '.\n\n' : '') +
                'Quedamos atentos a cualquier duda o comentario.\n\n' +
                'Saludos cordiales,\n' +
                (valorConfig('Firma (nombre)') ? valorConfig('Firma (nombre)') + '\n' : '') +
                (valorConfig('Razón social del emisor') || 'Ingenieros Asociados') +
                (valorConfig('Teléfono') ? '\nTel. ' + valorConfig('Teléfono') : '');
        }

        function mensajeCorreoCotUI(texto, tipo) {
            const el = document.getElementById('ccotMensaje');
            const estilos = { error: 'bg-red-50 text-red-700 border border-red-200',
                              ok: 'bg-green-50 text-green-700 border border-green-200',
                              info: 'bg-slate-100 text-slate-600 border border-slate-200' };
            el.className = 'text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        async function abrirCorreoCotizacion(c) {
            if (!hayBackend()) { avisar('El envío por correo requiere el backend de Apps Script configurado.'); return; }
            if (!c || !c.folio) { avisar('Guarda la cotización antes de enviarla: el folio se asigna al guardar.'); return; }
            if (!catalogoClientes.length) { try { await cargarCatalogoClientes(); } catch (_) {} }
            cotEnCorreo = c;
            const cli = clienteDeCotizacion(c);
            const correo = cli && cli.correo ? cli.correo : '';

            document.getElementById('ccotContexto').innerText =
                'Folio ' + c.folio + ' · ' + (c.razonSocial || c.cliente) + ' · ' + fmtMoneda(c.total, 'MXN');
            document.getElementById('ccotPara').value = correo;
            document.getElementById('ccotAyudaPara').innerHTML = correo
                ? 'Correo registrado en el catálogo de clientes.'
                : '<span class="text-amber-700 font-semibold">' + (cli ? 'Este cliente no tiene correo en el catálogo.' : 'La cotización no está ligada a un cliente del catálogo.') +
                  '</span> Escríbelo aquí; para no volver a capturarlo, agrégalo en Catálogos → Clientes.';
            document.getElementById('ccotCC').value = '';
            document.getElementById('ccotAsunto').value = 'Cotización ' + c.folio + ' · ' +
                (valorConfig('Razón social del emisor') || 'Ingenieros Asociados');
            document.getElementById('ccotCuerpo').value = textoCorreoCotizacion(c, cli);
            document.getElementById('ccotAdjuntar').checked = true;
            document.getElementById('ccotNombrePdf').innerText = '(' + nombreArchivoCotizacion(c) + ')';
            document.getElementById('ccotModo').value = 'enviar';
            document.getElementById('ccotMarcar').checked = true;
            document.getElementById('ccotMarcarWrap').classList.toggle('hidden', (c.estado || 'Emitida') !== 'Emitida');
            mensajeCorreoCotUI('', 'info');

            const m = document.getElementById('modalCorreoCot');
            m.classList.remove('hidden'); m.classList.add('flex');
            document.getElementById(correo ? 'ccotCuerpo' : 'ccotPara').focus();
        }

        function cerrarCorreoCotizacion() {
            const m = document.getElementById('modalCorreoCot');
            m.classList.add('hidden'); m.classList.remove('flex');
            cotEnCorreo = null;
        }

        function cargarScript(url, global) {
            if (window[global]) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => resolve();
                s.onerror = () => reject(new Error('No se pudo cargar la librería para generar el PDF. Revisa tu conexión e inténtalo de nuevo.'));
                document.head.appendChild(s);
            });
        }

        async function pdfCotizacionBase64(c) {
            await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
            await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');

            const { html } = armarHojasCotizacion(c);
            const caja = document.createElement('div');
            caja.style.cssText = 'position:absolute;left:-12000px;top:0;background:#fff;width:' + COT_ANCHO_MM + 'mm';
            caja.innerHTML = html;
            document.body.appendChild(caja);
            try {
                // carta: 215.9 × 279.4 mm; mismos márgenes que @page cotizacion
                const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait', compress: true });
                const hojas = caja.querySelectorAll('.cot-hoja');
                for (let i = 0; i < hojas.length; i++) {
                    const canvas = await window.html2canvas(hojas[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
                    if (i > 0) pdf.addPage('letter', 'portrait');
                    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 12, 10, COT_ANCHO_MM, COT_ALTO_MM);
                }
                pdf.setProperties({ title: 'Cotización ' + c.folio, author: valorConfig('Razón social del emisor') || 'Ingenieros Asociados' });
                return pdf.output('datauristring').split(',')[1];
            } finally {
                document.body.removeChild(caja);
            }
        }

        function htmlCorreoCotizacion(texto) {
            return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">' +
                String(texto).split(/\n{2,}/).map(p => '<p style="margin:0 0 12px">' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') +
                '</div>';
        }

        async function enviarCorreoCotizacion() {
            const c = cotEnCorreo;
            if (!c) return;
            const lista = (id) => document.getElementById(id).value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
            const para = lista('ccotPara'), cc = lista('ccotCC');
            const valido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            const asunto = document.getElementById('ccotAsunto').value.trim();
            const cuerpo = document.getElementById('ccotCuerpo').value;
            const modo = document.getElementById('ccotModo').value;

            if (!para.length || !para.every(valido)) { mensajeCorreoCotUI('Revisa el campo Para: cada dirección debe tener el formato nombre@dominio.', 'error'); return; }
            if (cc.length && !cc.every(valido)) { mensajeCorreoCotUI('Revisa el campo CC: hay una dirección con formato incorrecto.', 'error'); return; }
            if (!asunto) { mensajeCorreoCotUI('Escribe el asunto del correo.', 'error'); return; }

            const btn = document.getElementById('btnEnviarCorreoCot');
            btn.disabled = true;
            try {
                const adjuntos = [];
                if (document.getElementById('ccotAdjuntar').checked) {
                    btn.innerText = 'Generando PDF…';
                    mensajeCorreoCotUI('Generando el PDF de la cotización…', 'info');
                    adjuntos.push({ nombre: nombreArchivoCotizacion(c), tipo: 'application/pdf', datos: await pdfCotizacionBase64(c) });
                }
                btn.innerText = modo === 'borrador' ? 'Guardando…' : 'Enviando…';
                mensajeCorreoCotUI(modo === 'borrador' ? 'Creando el borrador…' : 'Enviando el correo…', 'info');

                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        accion: 'correo', token: tokenSesion(), modo: modo,
                        para: para, cc: cc, asunto: asunto,
                        cuerpo: cuerpo, html: htmlCorreoCotizacion(cuerpo),
                        adjuntos: adjuntos,
                        cliente: c.cliente || c.razonSocial || '', ordenId: 'Cotización ' + c.folio,
                        usuario: nombreUsuario()
                    })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'El servidor respondió de forma inesperada.');

                // Emitida → Enviada
                let marcada = false;
                if (modo !== 'borrador' && document.getElementById('ccotMarcar').checked && (c.estado || 'Emitida') === 'Emitida') {
                    try {
                        const r2 = await fetch(URL_APPS_SCRIPT, {
                            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({ accion: 'cambiarEstadoCotizacion', token: tokenSesion(),
                                                   usuario: nombreUsuario(), folio: c.folio, estado: 'Enviada' })
                        });
                        const j2 = await r2.json().catch(() => null);
                        if (j2 && j2.ok) {
                            marcada = true;
                            const enLista = cotizaciones.find(x => x.folio === c.folio);
                            if (enLista) enLista.estado = 'Enviada';
                        }
                    } catch (_) { /* el correo ya salió; el estado se puede cambiar a mano */ }
                }

                const resumen = (modo === 'borrador' ? 'Borrador creado para ' : 'Cotización ' + c.folio + ' enviada a ') + para.join(', ');
                registrarEvento('cotizacion_correo', resumen + (adjuntos.length ? ' · con PDF' : ''));
                cerrarCorreoCotizacion();
                renderListaCotizaciones();
                mostrarAviso(resumen + (marcada ? '. Quedó marcada como Enviada.' : '.'));
            } catch (err) {
                mensajeCorreoCotUI('No se envió: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Enviar correo';
            }
        }

        /* ============================================================
           v4.4 — CARGA MASIVA DE FACTURAS

           Se cargan todos los XML del mes de una vez. Cada uno se lee, se
           resuelve contra las órdenes y se propone como factura; después se
           revisa la lista y se registran las que estén correctas.

           La idea es que la revisión sea corta: la pantalla pone arriba lo
           que necesita atención y deja marcadas solo las que no tienen
           problema. Registrar a ciegas un lote de comprobantes es justo lo
           que no debe poder hacerse en algo que alimenta una auditoría.

           Motivos por los que una propuesta NO se puede registrar:
             · el archivo no es un CFDI
             · el folio fiscal ya está en otra factura
             · ninguna de sus órdenes se reconoció
             · alguna de sus órdenes ya está facturada
             · dos archivos del mismo lote amparan la misma orden
           ============================================================ */
        let propuestasLote = [];

        function ordenesDeTodoElHistorial() {
            return datosDetalleOrdenes.map(d => String(d.ID));
        }

        function clienteDeOrden(id) {
            const d = datosDetalleOrdenes.find(x => String(x.ID) === String(id));
            return d ? d.Cliente : '';
        }

        /* Convierte un CFDI ya parseado en una propuesta de factura, con sus
           órdenes resueltas y los motivos por los que no podría registrarse. */
        function armarPropuesta(nombreArchivo, cfdi) {
            const prop = {
                archivo: nombreArchivo, numero: cfdi.numero, fecha: cfdi.fecha,
                uuid: cfdi.uuid, subtotal: cfdi.subtotal, receptor: cfdi.receptor,
                ordenes: [], cliente: '', errores: [], avisos: [], seleccionada: false
            };

            (cfdi.conceptos || []).forEach(c => {
                // v4.5: reconoce por número de O.S. y, si no, por número de serie
                const r = resolverOrdenesDeConcepto(c.descripcion, datosDetalleOrdenes);
                if (r.ordenes.length === 0) {
                    prop.avisos.push('Concepto sin orden reconocible (' + textoPistas(r.pistas) + '): ' +
                                     (c.descripcion || '').slice(0, 40));
                    return;
                }
                const porOrden = (c.importe !== null) ? redondear(c.importe / r.ordenes.length) : null;
                r.ordenes.forEach(o => {
                    if (prop.ordenes.some(x => x.id === o.id)) return;
                    prop.ordenes.push({ id: o.id, importe: porOrden, via: o.via });
                });
            });

            // Todas las órdenes deben ser de la misma unidad
            const unidades = [...new Set(prop.ordenes.map(o => clienteDeOrden(o.id)).filter(Boolean))];
            prop.cliente = unidades[0] || '';
            if (unidades.length > 1) {
                prop.errores.push('Ampara órdenes de más de una unidad: ' + unidades.join(' · '));
            }

            if (!prop.numero) prop.errores.push('El comprobante no trae folio');
            if (!prop.fecha) prop.errores.push('El comprobante no trae fecha');
            if (prop.ordenes.length === 0) prop.errores.push('No se reconoció ninguna orden de servicio');

            if (prop.uuid) {
                const repetida = facturas.find(f => String(f.uuid || '').toUpperCase() === prop.uuid.toUpperCase());
                if (repetida) prop.errores.push('Este CFDI ya está en la factura ' + repetida.numero);
            } else {
                prop.avisos.push('Sin folio fiscal: no se podrá detectar si se registra dos veces');
            }

            const yaFacturadas = prop.ordenes.filter(o => facturaPorOrden.has(o.id));
            if (yaFacturadas.length) {
                prop.errores.push('Órdenes ya facturadas: ' +
                    yaFacturadas.map(o => o.id + ' (' + facturaPorOrden.get(o.id).numero + ')').join(', '));
            }

            const suma = prop.ordenes.reduce((a, o) => a + (o.importe || 0), 0);
            prop.total = suma;
            if (prop.subtotal !== null && Math.abs(suma - prop.subtotal) > 0.5) {
                prop.avisos.push('La suma repartida (' + fmtMoneda(suma, 'MXN') +
                                 ') no coincide con el subtotal (' + fmtMoneda(prop.subtotal, 'MXN') + ')');
            }
            return prop;
        }

        async function leerLoteCFDI(archivos) {
            propuestasLote = [];

            for (const archivo of archivos) {
                try {
                    const cfdi = parsearCFDI(await archivo.text());
                    propuestasLote.push(armarPropuesta(archivo.name, cfdi));
                } catch (err) {
                    propuestasLote.push({
                        archivo: archivo.name, numero: '', fecha: '', uuid: '', subtotal: null,
                        ordenes: [], cliente: '', total: 0, seleccionada: false,
                        errores: [err.message], avisos: []
                    });
                }
            }

            // Una misma orden en dos archivos del lote: ambos quedan marcados
            const vistas = new Map();
            propuestasLote.forEach(p => p.ordenes.forEach(o => {
                if (!vistas.has(o.id)) vistas.set(o.id, []);
                vistas.get(o.id).push(p);
            }));
            vistas.forEach((props, id) => {
                if (props.length > 1) props.forEach(p =>
                    p.errores.push('La orden ' + id + ' aparece en ' + props.length + ' archivos de este lote'));
            });

            // Quedan marcadas solo las que no tienen impedimento
            propuestasLote.forEach(p => { p.seleccionada = p.errores.length === 0; });
            renderLote();

            const m = document.getElementById('modalLote');
            m.classList.remove('hidden'); m.classList.add('flex');
        }

        function renderLote() {
            const listas = propuestasLote;
            const listos = listas.filter(p => p.errores.length === 0);
            const conAviso = listos.filter(p => p.avisos.length > 0);
            const bloqueadas = listas.filter(p => p.errores.length > 0);
            const importe = listas.filter(p => p.seleccionada).reduce((a, p) => a + p.total, 0);

            document.getElementById('loteSubtitulo').innerText =
                listas.length + ' archivo(s) leídos · revisa antes de registrar';

            document.getElementById('loteResumen').innerHTML =
                '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">' +
                    '<div class="bg-slate-50 border border-slate-200 rounded-lg py-2"><p class="text-xl font-bold text-slate-900">' + listas.length + '</p><p class="text-xs uppercase tracking-wide text-slate-500">archivos</p></div>' +
                    '<div class="bg-green-50 border border-green-200 rounded-lg py-2"><p class="text-xl font-bold text-green-700">' + listos.length + '</p><p class="text-xs uppercase tracking-wide text-green-800">listas</p></div>' +
                    '<div class="bg-amber-50 border border-amber-200 rounded-lg py-2"><p class="text-xl font-bold text-amber-700">' + conAviso.length + '</p><p class="text-xs uppercase tracking-wide text-amber-800">con observación</p></div>' +
                    '<div class="bg-red-50 border border-red-200 rounded-lg py-2"><p class="text-xl font-bold text-red-700">' + bloqueadas.length + '</p><p class="text-xs uppercase tracking-wide text-red-800">no registrables</p></div>' +
                '</div>' +
                '<p class="text-xs text-slate-600 mt-3">Importe de lo seleccionado: <span class="font-bold">' + fmtMoneda(importe, 'MXN') + '</span></p>';

            document.getElementById('loteLista').innerHTML = listas.map((p, i) => {
                const bloqueada = p.errores.length > 0;
                const color = bloqueada ? 'border-red-200 bg-red-50/40'
                                        : (p.avisos.length ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200');
                return '<div class="border rounded-lg p-3 ' + color + '">' +
                    '<div class="flex items-start gap-3">' +
                        '<input type="checkbox" data-lote="' + i + '" ' + (p.seleccionada ? 'checked' : '') +
                            (bloqueada ? ' disabled' : '') + ' class="mt-1 rounded border-slate-300">' +
                        '<div class="min-w-0 flex-1">' +
                            '<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">' +
                                '<span class="font-bold text-slate-900">' + esc(p.numero || 'sin folio') + '</span>' +
                                '<span class="text-xs text-slate-500">' + esc(p.fecha || 'sin fecha') + '</span>' +
                                '<span class="text-xs font-semibold text-slate-700">' + esc(p.cliente || 'unidad no identificada') + '</span>' +
                                '<span class="text-xs text-slate-500">' + p.ordenes.length + ' orden(es)</span>' +
                                '<span class="ml-auto font-bold ' + (bloqueada ? 'text-slate-400' : 'text-green-700') + '">' +
                                    fmtMoneda(p.total, 'MXN') + '</span>' +
                            '</div>' +
                            '<p class="text-xs text-slate-400 mt-0.5 font-mono truncate">' + esc(p.archivo) + '</p>' +
                            (p.ordenes.length
                                ? '<p class="text-xs text-slate-600 mt-1">' +
                                  p.ordenes.map(o => esc(o.id) + ' → ' + (o.importe === null ? 'sin importe' : fmtMoneda(o.importe, 'MXN'))).join('  ·  ') +
                                  '</p>'
                                : '') +
                            p.errores.map(e => '<p class="text-xs text-red-700 font-semibold mt-1">✕ ' + esc(e) + '</p>').join('') +
                            p.avisos.map(x => '<p class="text-xs text-amber-700 mt-1">· ' + esc(x) + '</p>').join('') +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');

            document.getElementById('btnRegistrarLote').disabled = listas.filter(p => p.seleccionada).length === 0;
        }

        document.getElementById('loteLista').addEventListener('change', (e) => {
            const chk = e.target.closest('[data-lote]');
            if (!chk) return;
            propuestasLote[parseInt(chk.dataset.lote, 10)].seleccionada = chk.checked;
            renderLote();
        });

        function cerrarModalLote() {
            const m = document.getElementById('modalLote');
            m.classList.add('hidden'); m.classList.remove('flex');
            propuestasLote = [];
            document.getElementById('loteProgreso').innerText = '';
        }

        async function registrarLote() {
            const pendientes = propuestasLote.filter(p => p.seleccionada && p.errores.length === 0);
            if (pendientes.length === 0) return;

            const btn = document.getElementById('btnRegistrarLote');
            const prog = document.getElementById('loteProgreso');
            btn.disabled = true;

            let ok = 0;
            const fallidas = [];

            /* Una por una y en orden: el servidor valida cada factura contra
               las ya registradas, así que mandarlas en paralelo permitiría que
               dos del mismo lote pasaran el control de duplicados a la vez. */
            for (let i = 0; i < pendientes.length; i++) {
                const p = pendientes[i];
                prog.innerText = 'Registrando ' + (i + 1) + ' de ' + pendientes.length + '…';
                try {
                    const r = await fetch(URL_APPS_SCRIPT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            accion: 'guardarFactura', token: tokenSesion(), usuario: nombreUsuario(),
                            factura: {
                                id: '', cliente: p.cliente, numero: p.numero, fecha: p.fecha,
                                uuid: p.uuid, nivel: '', notas: 'Carga masiva · ' + p.archivo,
                                ordenes: p.ordenes
                            }
                        })
                    });
                    const j = await r.json().catch(() => null);
                    if (!j || !j.ok) throw new Error((j && j.error) || 'respuesta inesperada del servidor');
                    ok++;
                    p.errores.push('Registrada');      // deja de ser seleccionable
                    p.seleccionada = false;
                } catch (err) {
                    fallidas.push(p.numero + ': ' + err.message);
                    p.errores.push('No se registró: ' + err.message);
                    p.seleccionada = false;
                }
            }

            await cargarFacturas();
            renderLote();
            renderAuditoria();
            registrarEvento('carga_masiva_facturas', ok + ' factura(s) registradas de ' + pendientes.length);

            prog.innerText = ok + ' registrada(s)' + (fallidas.length ? ' · ' + fallidas.length + ' con error' : '');
            btn.disabled = propuestasLote.filter(p => p.seleccionada).length === 0;
            if (fallidas.length === 0) {
                mostrarAviso(ok + ' factura(s) registradas desde el lote.');
            }
        }

        document.getElementById('btnRegistrarLote').addEventListener('click', registrarLote);

        document.getElementById('loteCFDI').addEventListener('change', (e) => {
            const archivos = Array.from(e.target.files || []);
            e.target.value = '';
            if (archivos.length) leerLoteCFDI(archivos);
        });

        /* ---------- Registro de factura ---------- */
        let facturaEnEdicion = null;      // factura cargada, o null si es nueva
        let ordenesFacturaActual = [];
        let facturaUUID = '';             // v4.3: folio fiscal leído del CFDI

        function mensajeFacturaUI(texto, tipo) {
            const el = document.getElementById('facMensaje');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-700 border border-green-200',
                info:  'bg-slate-100 text-slate-600 border border-slate-200'
            };
            el.className = 'text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.info);
            el.innerText = texto;
            el.classList.toggle('hidden', !texto);
        }

        function detalleOrden(id) {
            return datosDetalleOrdenes.find(d => String(d.ID) === String(id) && d.Cliente === clienteActual) ||
                   datosDetalleOrdenes.find(d => String(d.ID) === String(id)) || null;
        }

        /* v4.1: cada orden lleva su importe. En preventivos y calibraciones
           se sugiere el del tarifario y se puede corregir; en correctivos y
           entregas se captura desde cero, porque no hay tarifa que sugerir. */
        function sugerirImportes() {
            const nivel = document.getElementById('facNivel').value;
            ordenesFacturaActual.forEach(o => {
                if (o.tocado) return;                       // no se pisa lo ya escrito a mano
                const d = detalleOrden(o.id);
                if (!d || !tipoConTarifario(d['Tipo de Servicio'])) { o.importe = null; return; }
                const t = tarifaDeEquipo(d.Equipo, d['Tipo de Servicio']);
                o.importe = (t && t.precios[nivel] !== null && t.precios[nivel] !== undefined) ? t.precios[nivel] : null;
            });
        }

        function totalFacturaActual() {
            return ordenesFacturaActual.reduce((a, o) => a + (Number(o.importe) || 0), 0);
        }

        function renderListaOrdenesFactura() {
            const cont = document.getElementById('facListaOrdenes');
            const nivel = document.getElementById('facNivel').value;

            document.getElementById('facTotal').innerText =
                ordenesFacturaActual.length ? ('Total: ' + fmtMoneda(totalFacturaActual(), 'MXN')) : '';

            if (ordenesFacturaActual.length === 0) {
                cont.innerHTML = '<p class="px-4 py-3 text-xs text-slate-500 italic">No quedó ninguna orden en esta factura.</p>';
                return;
            }

            cont.innerHTML = ordenesFacturaActual.map(o => {
                const d = detalleOrden(o.id);
                const conTarifa = d && tipoConTarifario(d['Tipo de Servicio']);
                const t = conTarifa ? tarifaDeEquipo(d.Equipo, d['Tipo de Servicio']) : null;
                const esperado = t ? t.precios[nivel] : null;

                let nota;
                if (!d) nota = '<span class="text-red-600">Orden de otra unidad o ya no disponible</span>';
                else if (!conTarifa) nota = esc(d.Equipo) + ' · <span class="text-amber-700 font-semibold">precio variable</span>';
                else if (esperado === null || esperado === undefined) nota = esc(d.Equipo) + ' · <span class="text-amber-700 font-semibold">sin tarifa en el tarifario</span>';
                else nota = esc(d.Equipo) + ' · tarifario ' + fmtMoneda(esperado, t.moneda);

                const difiere = (esperado !== null && esperado !== undefined && o.importe !== null &&
                                 Number(o.importe) !== Number(esperado));

                return '<div class="flex items-center justify-between gap-3 px-4 py-2">' +
                           '<div class="min-w-0 flex-1">' +
                               '<p class="text-xs font-bold text-slate-700">' + esc(o.id) +
                                   (d ? ' <span class="font-normal text-slate-400">· ' + esc(d.FechaEjecucionStr) + '</span>' : '') + '</p>' +
                               '<p class="text-xs text-slate-500 truncate">' + nota + '</p>' +
                           '</div>' +
                           '<div class="shrink-0 flex items-center gap-2">' +
                               '<input type="number" step="0.01" min="0" data-importe-orden="' + esc(o.id) + '" ' +
                                   'value="' + (o.importe === null || o.importe === undefined ? '' : o.importe) + '" ' +
                                   'placeholder="' + (conTarifa ? '0.00' : 'por definir') + '" ' +
                                   'class="w-28 p-1.5 border rounded-lg text-xs text-right outline-none focus:border-brand-500 ' +
                                   (difiere ? 'border-amber-400 bg-amber-50' : 'border-slate-300') + '">' +
                               '<button data-quitar-orden="' + esc(o.id) + '" class="text-xs font-semibold text-red-500 hover:text-red-700">Quitar</button>' +
                           '</div>' +
                       '</div>';
            }).join('');
        }

        document.getElementById('facListaOrdenes').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-quitar-orden]');
            if (!btn) return;
            ordenesFacturaActual = ordenesFacturaActual.filter(o => o.id !== btn.dataset.quitarOrden);
            renderListaOrdenesFactura();
        });

        document.getElementById('facListaOrdenes').addEventListener('input', (e) => {
            const campo = e.target.closest('[data-importe-orden]');
            if (!campo) return;
            const o = ordenesFacturaActual.find(x => x.id === campo.dataset.importeOrden);
            if (!o) return;
            o.importe = campo.value === '' ? null : parseFloat(campo.value);
            o.tocado = true;                                  // ya no se sobrescribe al cambiar de nivel
            document.getElementById('facTotal').innerText = 'Total: ' + fmtMoneda(totalFacturaActual(), 'MXN');
        });

        document.getElementById('facNivel').addEventListener('change', () => {
            sugerirImportes();
            renderListaOrdenesFactura();
        });

        function abrirModalFactura(clave) {
            const seleccion = ordenesSeleccionadas(clave);
            if (seleccion.length === 0) return;

            // Si alguna ya está facturada, se avisa y no se incluye
            const yaFacturadas = seleccion.filter(o => facturaPorOrden.has(o));
            ordenesFacturaActual = seleccion.filter(o => !facturaPorOrden.has(o))
                                            .map(id => ({ id: id, importe: null, tocado: false }));

            if (ordenesFacturaActual.length === 0) {
                mostrarAviso('Todas las órdenes seleccionadas ya están facturadas. ' +
                             'Para revisarlas o corregirlas, haz clic en el folio de la columna Factura.');
                return;
            }

            facturaEnEdicion = null;
            document.getElementById('tituloModalFactura').innerText = 'Registrar factura';
            document.getElementById('subtituloModalFactura').innerText =
                clienteActual + ' · una factura puede cubrir varios servicios';
            document.getElementById('facNumero').value = '';
            document.getElementById('facFecha').value = new Date().toISOString().slice(0, 10);
            document.getElementById('facNotas').value = '';
            document.getElementById('facNivel').value = 'I';
            document.getElementById('btnEliminarFactura').classList.add('hidden');
            facturaUUID = '';
            mensajeCFDI('', 'ok');

            sugerirImportes();
            renderListaOrdenesFactura();
            mensajeFacturaUI(yaFacturadas.length
                ? ('Se excluyeron ' + yaFacturadas.length + ' orden(es) que ya están en otra factura: ' + yaFacturadas.join(', ') + '.')
                : '', yaFacturadas.length ? 'info' : 'info');

            const m = document.getElementById('modalFactura');
            m.classList.remove('hidden'); m.classList.add('flex');
            setTimeout(() => document.getElementById('facNumero').focus(), 60);
        }

        function abrirFacturaExistente(idFactura) {
            const f = facturas.find(x => x.id === idFactura);
            if (!f) return;
            facturaEnEdicion = f;
            ordenesFacturaActual = ((f.detalle && f.detalle.length)
                    ? f.detalle
                    : (f.ordenes || []).map(id => ({ id: id, importe: null })))
                .map(o => ({ id: String(o.id), importe: (o.importe === undefined ? null : o.importe), tocado: true }));

            document.getElementById('tituloModalFactura').innerText = 'Factura ' + f.numero;
            document.getElementById('subtituloModalFactura').innerText =
                (f.cliente || clienteActual) + ' · registrada por ' + (f.registradoPor || 'sin dato');
            document.getElementById('facNumero').value = f.numero || '';
            document.getElementById('facFecha').value = (f.fecha || '').slice(0, 10);
            document.getElementById('facNotas').value = f.notas || '';
            document.getElementById('facNivel').value = f.nivel || 'I';
            document.getElementById('btnEliminarFactura').classList.remove('hidden');
            facturaUUID = f.uuid || '';
            mensajeCFDI(f.uuid
                ? '<p class="font-bold">Comprobante asociado</p><p class="font-mono text-xs">' + esc(f.uuid) + '</p>'
                : '', 'ok');

            renderListaOrdenesFactura();
            mensajeFacturaUI('', 'info');
            const m = document.getElementById('modalFactura');
            m.classList.remove('hidden'); m.classList.add('flex');
        }

        function cerrarModalFactura() {
            const m = document.getElementById('modalFactura');
            m.classList.add('hidden'); m.classList.remove('flex');
            facturaEnEdicion = null;
            ordenesFacturaActual = [];
            facturaUUID = '';
        }

        function limpiarSeleccion(clave) {
            const cont = document.getElementById('content' + PESTANAS_SERVICIO[clave].suf);
            cont.querySelectorAll('.chk-orden, .chk-todos').forEach(x => { x.checked = false; });
            actualizarBarraFacturacion(clave);
        }

        async function guardarFacturaDesdeModal() {
            const numero = document.getElementById('facNumero').value.trim();
            const fecha = document.getElementById('facFecha').value;
            const notas = document.getElementById('facNotas').value.trim();

            if (!numero) { mensajeFacturaUI('Captura el número de factura.', 'error'); return; }
            if (!fecha) { mensajeFacturaUI('Captura la fecha de la factura.', 'error'); return; }
            if (ordenesFacturaActual.length === 0) { mensajeFacturaUI('La factura debe cubrir al menos una orden.', 'error'); return; }
            if (!hayBackend()) { mensajeFacturaUI('La facturación requiere el backend de Apps Script configurado.', 'error'); return; }

            const btn = document.getElementById('btnGuardarFactura');
            btn.disabled = true; btn.innerText = 'Guardando…';
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        accion: 'guardarFactura', token: tokenSesion(),
                        usuario: nombreUsuario(),
                        factura: {
                            id: facturaEnEdicion ? facturaEnEdicion.id : '',
                            cliente: facturaEnEdicion ? (facturaEnEdicion.cliente || clienteActual) : clienteActual,
                            numero: numero, fecha: fecha, notas: notas,
                            nivel: document.getElementById('facNivel').value,
                            uuid: facturaUUID,
                            ordenes: ordenesFacturaActual.map(o => ({ id: o.id, importe: o.importe }))
                        }
                    })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo guardar la factura.');

                registrarEvento('factura_registrada',
                    'Factura ' + numero + ' · ' + ordenesFacturaActual.length + ' orden(es) · ' +
                    fmtMoneda(totalFacturaActual(), 'MXN'));
                const n = ordenesFacturaActual.length;
                const importe = fmtMoneda(totalFacturaActual(), 'MXN');
                cerrarModalFactura();
                await cargarFacturas();
                Object.keys(PESTANAS_SERVICIO).forEach(k => { renderTablaServicio(k); limpiarSeleccion(k); });
                mostrarAviso('Factura ' + numero + ' registrada con ' + n + ' servicio(s) por ' + importe + '.');
            } catch (err) {
                mensajeFacturaUI(err.message, 'error');
            } finally {
                btn.disabled = false; btn.innerText = 'Guardar factura';
            }
        }

        async function eliminarFacturaActual() {
            if (!facturaEnEdicion) return;
            if (!(await confirmar('¿Eliminar la factura ' + facturaEnEdicion.numero + '? Las ' +
                         (facturaEnEdicion.ordenes || []).length +
                         ' orden(es) volverán a aparecer como no facturadas y se perderán sus importes capturados.',
                         { titulo: 'Eliminar factura', textoSi: 'Eliminar', peligro: true }))) return;
            try {
                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        accion: 'eliminarFactura', token: tokenSesion(),
                        usuario: nombreUsuario(), id: facturaEnEdicion.id
                    })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'No se pudo eliminar.');
                const num = facturaEnEdicion.numero;
                cerrarModalFactura();
                await cargarFacturas();
                Object.keys(PESTANAS_SERVICIO).forEach(k => renderTablaServicio(k));
                mostrarAviso('Factura ' + num + ' eliminada.');
            } catch (err) {
                mensajeFacturaUI(err.message, 'error');
            }
        }

        document.getElementById('btnGuardarFactura').addEventListener('click', guardarFacturaDesdeModal);
        document.getElementById('btnEliminarFactura').addEventListener('click', eliminarFacturaActual);

        const elPestana = (clave, base) =>
            document.getElementById(base + PESTANAS_SERVICIO[clave].suf);

        function obtenerServiciosFiltrados(clave) {
            const c = PESTANAS_SERVICIO[clave];
            const textoBusqueda = normalizar(elPestana(clave, 'filtroTexto').value.toLowerCase());
            const anio = elPestana(clave, 'filtroAnio').value;
            const mesEjec = elPestana(clave, 'filtroMesEjec').value;
            const mesProx = c.conProximo ? elPestana(clave, 'filtroMesProx').value : 'todos';

            return c.datos().filter(d => {
                const blob = normalizar((d.ID + ' ' + d.Equipo + ' ' + d.Marca + ' ' + d.Serie + ' ' +
                                         d.Modelo + ' ' + d.Inventario + ' ' + d.Area).toLowerCase());
                const coincideTexto = !textoBusqueda || blob.includes(textoBusqueda);
                const coincideAnio = anio === 'todos' || d.Anio === anio;
                const coincideMesEjec = mesEjec === 'todos' || d.Mes === mesEjec;
                const coincideProx = mesProx === 'todos' ||
                                     (d.MesProximoMant !== undefined && d.MesProximoMant.toString() === mesProx);
                return coincideTexto && coincideAnio && coincideMesEjec && coincideProx;
            });
        }

        function renderTablaServicio(clave) {
            const c = PESTANAS_SERVICIO[clave];
            const tbody = elPestana(clave, 'tabla');
            if (!tbody) return;
            tbody.innerHTML = '';

            const filtrados = obtenerServiciosFiltrados(clave);
            elPestana(clave, 'contador').innerText =
                filtrados.length + ' de ' + c.datos().length + ' registros';

            if (filtrados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="' + (c.conProximo ? 9 : 8) +
                    '" class="px-4 py-8 text-center text-slate-500">No hay ' + c.titulo +
                    ' que coincidan con la búsqueda.</td></tr>';
                return;
            }

            // v2.6: comparar contra el inicio del día local para que un
            // mantenimiento que vence HOY no aparezca como "vencido"
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            filtrados.forEach(d => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';

                const celdaChk = `<td class="px-3 py-3 no-print"><input type="checkbox" class="chk-orden rounded border-slate-300" data-orden="${esc(d.ID)}"></td>`;
                const celdaFactura = `<td class="px-4 py-3">${htmlCeldaFactura(d.ID)}</td>`;

                if (c.conProximo) {
                    const vencido = d.ProximoMantDate && d.ProximoMantDate < hoy;
                    const badge = vencido
                        ? '<span class="ml-2 inline-block whitespace-nowrap bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full uppercase">⚠ Vencido</span>'
                        : '';
                    tr.innerHTML = celdaChk + `
                        <td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">${esc(d.ID)}</td>
                        <td class="px-4 py-3">
                            <div class="font-semibold text-slate-800">${esc(d.Equipo)}</div>
                            <div class="text-xs text-slate-500">${esc(d.Marca)} / ${esc(d.Modelo)}</div>
                        </td>
                        <td class="px-4 py-3">
                            <div class="text-slate-800">${esc(d.Serie)}</div>
                            <div class="text-xs text-slate-500">Inv: ${esc(d.Inventario)}</div>
                        </td>
                        <td class="px-4 py-3 text-slate-600">${esc(d.Area)}</td>
                        <td class="px-4 py-3 text-slate-600">${esc(d.FechaEjecucionStr)}</td>
                        <td class="px-4 py-3 font-bold ${vencido ? 'text-red-600' : 'text-brand-600'}">${esc(d.ProximoMantStr)}${badge}</td>
                        ` + celdaFactura + `
                        <td class="px-4 py-3 text-right no-print">
                            <button data-id="${esc(d.ID)}" class="btn-rutina text-brand-600 hover:text-brand-800 hover:bg-brand-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border border-transparent hover:border-brand-200 shadow-sm bg-white">
                                Generar Rutina
                            </button>
                        </td>`;
                } else {
                    tr.innerHTML = celdaChk + `
                        <td class="px-4 py-3 font-bold text-slate-700 whitespace-nowrap">${esc(d.ID)}</td>
                        <td class="px-4 py-3 text-slate-800 font-medium">${esc(d.Equipo)}</td>
                        <td class="px-4 py-3 text-slate-600">${esc(d.Marca)} / ${esc(d.Modelo)}</td>
                        <td class="px-4 py-3 text-slate-600">${esc(d.Serie)}</td>
                        <td class="px-4 py-3 text-slate-500 text-xs">${esc(d['Tipo de Servicio'])}</td>
                        <td class="px-4 py-3 text-slate-600">${esc(d.FechaEjecucionStr)}</td>
                        ` + celdaFactura;
                }
                tbody.appendChild(tr);
            });

            // v3.8: al redibujar se pierde la selección; la barra debe reflejarlo
            const chkTodos = document.getElementById('content' + c.suf);
            if (chkTodos) {
                const t = chkTodos.querySelector('.chk-todos');
                if (t) t.checked = false;
            }
            actualizarBarraFacturacion(clave);
        }

        /* Deja las cuatro pestañas listas al abrir una unidad: llena los años,
           limpia los filtros y dibuja las tablas. */
        function prepararPestanasServicio() {
            Object.keys(PESTANAS_SERVICIO).forEach(clave => {
                const c = PESTANAS_SERVICIO[clave];
                poblarSelectAnios('filtroAnio' + c.suf, c.datos());
                elPestana(clave, 'filtroTexto').value = '';
                elPestana(clave, 'filtroAnio').value = 'todos';
                if (c.conProximo) elPestana(clave, 'filtroMesProx').value = 'todos';
                poblarSelectMeses('filtroMesEjec' + c.suf, c.datos(), 'todos',
                                  c.conProximo ? 'Todos' : 'Todos los meses');
                renderTablaServicio(clave);
            });
        }

        function exportarCSVServicio(clave) {
            const c = PESTANAS_SERVICIO[clave];
            const filtrados = obtenerServiciosFiltrados(clave);
            if (filtrados.length === 0) return avisar('No hay datos para exportar');

            const campo = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
            const cabecera = c.conProximo
                ? 'Orden,Equipo,Marca,Modelo,Serie,Inventario,Area,Fecha Ejecucion,Proximo Servicio'
                : 'Orden,Equipo,Marca,Modelo,Serie,Inventario,Area,Fecha Ejecucion,Tipo de Servicio';
            let csv = '\uFEFF' + cabecera + '\n';
            filtrados.forEach(d => {
                const fila = [d.ID, d.Equipo, d.Marca, d.Modelo, d.Serie, d.Inventario, d.Area, d.FechaEjecucionStr,
                              c.conProximo ? d.ProximoMantStr : d['Tipo de Servicio']];
                csv += fila.map(campo).join(',') + '\n';
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = c.archivo + '_' + clienteActual.replace(/\s+/g, '_') + '.csv';
            link.click();
            URL.revokeObjectURL(link.href);
            registrarEvento('exportar_csv', c.titulo + ' · ' + filtrados.length + ' registros');
        }

        function imprimirTablaServicio(clave) {
            registrarEvento('imprimir_tabla', PESTANAS_SERVICIO[clave].titulo);
            window.print();
        }

        // Nombres anteriores, por si quedan llamadas sueltas en el archivo
        const renderTablaPreventivos = () => renderTablaServicio('prev');
        const renderTablaCorrectivos = () => renderTablaServicio('corr');
        const obtenerPreventivosFiltrados = () => obtenerServiciosFiltrados('prev');


        /* ============================================================
           PARSER ESTRUCTURADO DE MEDICIONES
           El formato real de Jotform es:
           "Medicion: X, Valor Programado: A, Valor Desplegado: B, Valor Medido: C ..."
           Antes se extraían números sueltos (incluyendo el "2" de SPO2 o el
           "20" de cmH20), lo cual generaba tablas y gráficas incorrectas.
           ============================================================ */
        function extraerCampoMedicion(segmento, campo) {
            const re = new RegExp('valor\\s+' + campo + '\\s*:\\s*([\\s\\S]*?)(?=,?\\s*valor\\s+(?:programado|desplegado|medido)\\s*:|$)', 'i');
            const m = normalizar(segmento).match(re);
            if (!m) return '';
            return m[1].replace(/^[,\s]+|[,\s]+$/g, '');
        }

        /* ============================================================
           v3.0 — LECTURA DE CAMPOS LIBRES DENTRO DE UN BLOQUE DE MEDICIÓN
           Permite recuperar campos distintos de programado/desplegado/medido,
           por ejemplo "Rango de trabajo: 0-300".
           ============================================================ */
        function extraerCampoLibre(segmento, etiquetas) {
            const texto = normalizar(segmento);
            for (const et of etiquetas) {
                const re = new RegExp(normalizar(et) + '\\s*:\\s*([\\s\\S]*?)(?=,?\\s*(?:valor\\s+(?:programado|desplegado|medido)|rango\\s+de\\s+trabajo|rango)\\s*:|$)', 'i');
                const m = texto.match(re);
                if (m && m[1].trim()) return m[1].replace(/^[,\s]+|[,\s]+$/g, '');
            }
            return '';
        }

        /* ============================================================
           v3.0.1 — VALOR INCRUSTADO EN EL NOMBRE DE LA MEDICIÓN
           El formulario captura las condiciones ambientales dentro del propio
           nombre del renglón, con las tres columnas de valor vacías:
               "Temperatura ambiental (°C) 16°C"   → 16
               "Humedad Relativa ambiental (%) 77%" → 77
           Los paréntesis se descartan antes de buscar el número, porque ahí
           vive la unidad —"(°C)", "(%)"— y no el dato.
           ============================================================ */
        function valorDesdeNombre(nombre) {
            const sinParentesis = String(nombre || '').replace(/\([^)]*\)/g, ' ');
            const nums = sinParentesis.replace(',', '.').match(/-?\d+(?:\.\d+)?/g);
            return (nums && nums.length) ? nums[nums.length - 1] : '';
        }

        /* ============================================================
           v3.0.1 — RANGO ESTÁNDAR DE OPERACIÓN CAPTURADO EN LA ORDEN
           El ingeniero lo escribe como un renglón propio, sin valores, justo
           antes de las mediciones del parámetro al que aplica:

             "Rango estándar de operación ECG 20 BPM-300BPM"
             "Rango estándar de operación SpO2  1 %O2-100 %O2"
             "Rango estandar de operacion PANI 10/30 mmHg- 220/260mmHg"
             "Rango estándar de operación  6J-200J"      ← sin nombre de parámetro

           Del renglón se obtienen tres cosas: el parámetro (lo que va antes
           del primer dígito, puede venir vacío), los dos extremos y la unidad.
           Los extremos admiten valor compuesto: la PANI va de 10/30 a 220/260,
           así que la sistólica opera de 10 a 220 y la diastólica de 30 a 260.
           ============================================================ */
        const RE_PREFIJO_RANGO = /^\s*rango\s*(?:estandar|estándar)?\s*(?:de\s+)?(?:operacion|operación|trabajo)?\s*/i;

        // Parte "20 BPM-300BPM" en sus dos extremos. Se acepta el primer
        // separador que deje número a ambos lados, para que un mínimo negativo
        // ("-10 a 10") no se confunda con el separador del rango.
        function separarLadosRango(cuerpo) {
            const re = /[-–—]|\s+a\s+|\s+hasta\s+/gi;
            let m;
            while ((m = re.exec(String(cuerpo))) !== null) {
                const izq = String(cuerpo).slice(0, m.index).trim();
                const der = String(cuerpo).slice(m.index + m[0].length).trim();
                if (/\d/.test(izq) && /\d/.test(der)) return [izq, der];
            }
            return null;
        }

        /* Grupos numéricos de un texto, admitiendo compuestos con barra:
           "SpO2  1 %O2" → ["2", "1"]   ·   "PANI 10/30 mmHg" → ["10/30"] */
        const RE_GRUPO_NUM = /-?\d+(?:[.,]\d+)?(?:\/-?\d+(?:[.,]\d+)?)*/g;

        function gruposNumericos(texto) {
            return String(texto || '').match(RE_GRUPO_NUM) || [];
        }

        /* v3.5 — Rangos expresados como RELACIÓN, del tipo
           "Rango estándar de operación I:E 4:1-1:9 (relación Inspiración:
           Espiración)". Las relaciones no son magnitudes que se puedan situar
           en un eje, así que se conservan como texto: se imprimen tal cual en
           la tabla y en la leyenda, y no dibujan banda en la gráfica. Antes el
           parser intentaba sacarles números y devolvía "1 – 1" sin sentido. */
        const RE_RELACION = /\d+\s*:\s*\d+/;

        function parsearRangoEstandar(nombreOrig) {
            const t = String(nombreOrig || '').trim();
            const sinPrefijo = t.replace(RE_PREFIJO_RANGO, '').trim();
            if (!sinPrefijo) return null;

            // ---- Caso relación (I:E) ----
            if (RE_RELACION.test(sinPrefijo)) {
                const m = sinPrefijo.match(RE_RELACION);
                const param = sinPrefijo.slice(0, m.index).trim().replace(/[:\-–—,]+$/, '').trim();
                const cuerpo = sinPrefijo.slice(m.index).trim();
                return {
                    param: param,
                    minPartes: [], maxPartes: [],
                    unidad: '',
                    soloTexto: true,
                    texto: cuerpo.replace(/\s*-\s*/, ' – ')
                };
            }

            const lados = separarLadosRango(sinPrefijo);
            if (!lados) return null;

            /* El nombre del parámetro puede contener dígitos —SpO2, EtCO2,
               N2O—, así que NO se puede cortar en el primer número: del lado
               izquierdo se toma el ÚLTIMO grupo numérico (el mínimo) y lo que
               queda antes es el nombre. Del derecho se toma el PRIMERO. */
            const derGrupos = gruposNumericos(lados[1]);
            if (!derGrupos.length) return null;
            const gMax = derGrupos[0];
            const iMax = lados[1].indexOf(gMax);
            const unidad = lados[1].slice(iMax + gMax.length).trim();

            /* La unidad también trae dígitos ("%O2", "cmH2O"), así que antes de
               buscar el mínimo se le quita al lado izquierdo. Sin esto,
               "SpO2 1 %O2" entregaría el 2 de "%O2" como valor mínimo. */
            const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const izqLimpio = unidad
                ? lados[0].replace(new RegExp(escapar(unidad), 'gi'), ' ')
                : lados[0];

            const izqGrupos = gruposNumericos(izqLimpio);
            if (!izqGrupos.length) return null;
            const gMin = izqGrupos[izqGrupos.length - 1];

            const minPartes = medicionAPartes(gMin);
            const maxPartes = medicionAPartes(gMax);
            if (!minPartes.length || !maxPartes.length) return null;

            const iMin = izqLimpio.lastIndexOf(gMin);
            const param = izqLimpio.slice(0, iMin).trim().replace(/[:\-–—,]+$/, '').trim();

            return {
                param: param,
                minPartes: minPartes,
                maxPartes: maxPartes,
                unidad: unidad,
                texto: gMin + ' – ' + gMax + (unidad ? ' ' + unidad : '')
            };
        }

        // Rango normalizado para imprimir: "10/30 – 220/260 mmHg"
        function textoRangoCapturado(r) {
            if (!r) return '';
            if (r.soloTexto) return r.texto;      // relaciones tipo 4:1 – 1:9
            const j = (a) => a.map(v => redondear(v)).join('/');
            return j(r.minPartes) + ' – ' + j(r.maxPartes) + (r.unidad ? ' ' + r.unidad : '');
        }

        /* ============================================================
           v3.0 — RANGO DE TRABAJO CAPTURADO EN LA ORDEN
           "0-300", "0 a 300", "0 – 300 mmHg", "de 0 a 300"  →  {min, max}
           Si solo viene un número no se considera rango válido: un rango
           incompleto en un documento de calibración es peor que no ponerlo.
           ============================================================ */
        function parsearRangoTrabajo(texto) {
            const t = String(texto || '').trim();
            if (!t) return null;
            const limpio = t.replace(',', '.');
            const m = limpio.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|a|hasta)\s*(-?\d+(?:\.\d+)?)/i);
            if (!m) return null;
            const min = parseFloat(m[1]), max = parseFloat(m[2]);
            if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
            // La unidad es lo que quede después del segundo número
            const resto = limpio.slice(limpio.indexOf(m[0]) + m[0].length).trim();
            return {
                min: Math.min(min, max),
                max: Math.max(min, max),
                unidad: resto.replace(/^[.,;\s]+/, '').trim(),
                texto: t
            };
        }

        /* ============================================================
           v2.7 — TOLERANCIAS POR PARÁMETRO
           La tolerancia fija de ±10 % es inadecuada para presión: un error de
           8 mmHg sobre 80 mmHg "aprobaba" con el criterio relativo, cuando el
           criterio de referencia para esfigmomanómetros es ±3 mmHg.
             tipo 'abs'   → error absoluto máximo (unidades del parámetro)
             tipo 'rel'   → fracción del valor programado (0.10 = 10 %)
             tipo 'mixta' → aprueba si cumple el mayor de los dos criterios
           La clave se busca dentro del nombre del parámetro, sin acentos ni
           mayúsculas; manda la primera regla que coincida. REVISAR contra el
           procedimiento de calibración de cada contrato.
           ============================================================ */
        /* ============================================================
           v3.5 — LA TOLERANCIA DEPENDE DEL TIPO DE EQUIPO

           Criterio fijado por el ingeniero a cargo:
             · Equipo de soporte de vida  →  5 %
             · Todos los demás            →  10 %

           Antes el criterio era por parámetro y con valores absolutos
           (±3 mmHg, ±2 %, ±0.3 °C). Esa tabla se conserva más abajo y puede
           reactivarse con CRITERIO_TOLERANCIA = 'parametro', pero el criterio
           vigente del documento es el del equipo.

           Conviene tenerlo presente al revisar un documento firmado: un
           criterio relativo del 10 % aprueba una desviación de 8 mmHg sobre
           80 mmHg. Si en algún contrato eso no es aceptable, el modo
           'parametro' queda listo para usarse.
           ============================================================ */
        const CRITERIO_TOLERANCIA = 'equipo';      // 'equipo' | 'parametro'
        const TOLERANCIA_SOPORTE_VIDA = 0.05;      // 5 %
        const TOLERANCIA_GENERAL      = 0.10;      // 10 %

        /* Equipos considerados de soporte de vida. La coincidencia es por
           contención y sin acentos, para que "Ventilador volumétrico" o
           "Máquina de anestesia Fabius" entren igual. */
        const EQUIPOS_SOPORTE_VIDA = [
            'desfibrilador',
            'anestesia',            // máquina de anestesia
            'ventilador',           // volumétrico, de transporte, neonatal
            'vaporizador'
        ];

        // Equipo de la rutina abierta; lo fija abrirRutina()
        let equipoRutinaActual = '';

        function esEquipoSoporteVida(nombreEquipo) {
            const n = normalizar(String(nombreEquipo || '')).toLowerCase();
            if (!n) return false;
            return EQUIPOS_SOPORTE_VIDA.some(k => n.includes(k));
        }

        const TOLERANCIA_DEFAULT = { tipo: 'rel', valor: 0.10 };

        const TOLERANCIAS_PARAMETRO = [
            { clave: 'pani',                tipo: 'abs',   valor: 3,   unidad: 'mmHg'  },
            { clave: 'nibp',                tipo: 'abs',   valor: 3,   unidad: 'mmHg'  },
            { clave: 'presion arterial',    tipo: 'abs',   valor: 3,   unidad: 'mmHg'  },
            { clave: 'presion no invasiva', tipo: 'abs',   valor: 3,   unidad: 'mmHg'  },
            { clave: 'tension arterial',    tipo: 'abs',   valor: 3,   unidad: 'mmHg'  },
            { clave: 'spo2',                tipo: 'abs',   valor: 2,   unidad: '%'     },
            { clave: 'temperatura',         tipo: 'abs',   valor: 0.3, unidad: '°C'    },
            { clave: 'energia',             tipo: 'mixta', abs: 3, rel: 0.15, unidad: 'J' },
            { clave: 'frecuencia',          tipo: 'rel',   valor: 0.05 },
            { clave: 'flujo',               tipo: 'rel',   valor: 0.10, unidad: 'L/min' }
        ];

        function toleranciaParaParametro(nombre) {
            // v3.5: el criterio vigente lo marca el tipo de equipo, no el parámetro
            if (CRITERIO_TOLERANCIA === 'equipo') {
                return esEquipoSoporteVida(equipoRutinaActual)
                    ? { tipo: 'rel', valor: TOLERANCIA_SOPORTE_VIDA, soporteVida: true }
                    : { tipo: 'rel', valor: TOLERANCIA_GENERAL, soporteVida: false };
            }
            const n = normalizar(String(nombre || '')).toLowerCase();
            return TOLERANCIAS_PARAMETRO.find(t => n.includes(t.clave)) || TOLERANCIA_DEFAULT;
        }

        // De dónde sale el criterio, para imprimirlo junto a la tolerancia
        function origenTolerancia() {
            if (CRITERIO_TOLERANCIA !== 'equipo') return 'criterio por parámetro';
            return esEquipoSoporteVida(equipoRutinaActual)
                ? 'equipo de soporte de vida'
                : 'equipo de uso general';
        }

        function fueraDeTolerancia(nombre, programado, error) {
            const t = toleranciaParaParametro(nombre);
            const e = Math.abs(error);
            if (t.tipo === 'abs')   return e > t.valor;
            if (t.tipo === 'mixta') return e > Math.max(t.abs, Math.abs(programado) * t.rel);
            return programado !== 0 && e > Math.abs(programado) * t.valor;
        }

        function textoTolerancia(nombre) {
            const t = toleranciaParaParametro(nombre);
            const u = t.unidad ? ' ' + t.unidad : '';
            if (t.tipo === 'abs')   return '±' + t.valor + u;
            if (t.tipo === 'mixta') return '±' + t.abs + u + ' o ±' + Math.round(t.rel * 100) + '%';
            return '±' + Math.round(t.valor * 100) + '%';
        }

        // "±5 % · equipo de soporte de vida", para imprimir en las gráficas
        function textoToleranciaCompleto(nombre) {
            return textoTolerancia(nombre) + ' · ' + origenTolerancia();
        }

        // v2.8: margen absoluto permitido para un valor programado concreto
        function margenTolerancia(nombre, programado) {
            const t = toleranciaParaParametro(nombre);
            if (t.tipo === 'abs')   return redondear(t.valor);
            if (t.tipo === 'mixta') return redondear(Math.max(t.abs, Math.abs(programado) * t.rel));
            return redondear(Math.abs(programado) * t.valor);
        }

        /* v2.9 — REDONDEO ÚNICO A 2 DECIMALES
           Todo número calculado por el sistema (errores, porcentajes, límites de
           tolerancia, valores de las gráficas) pasa por aquí. Se aplica al
           RESULTADO, nunca a los datos de entrada: los valores capturados en la
           orden se conservan tal cual se registraron.
           Devuelve el número (no una cadena) para que las gráficas sigan
           tratándolo como magnitud. */
        const redondear = (n) => {
            const v = Number(n);
            return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : v;
        };

        /* ============================================================
           v2.8 — RANGOS ESTÁNDAR DE OPERACIÓN
           Intervalo dentro del cual el parámetro debe poder trabajar según el
           equipo/patrón. Es distinto de la tolerancia: la tolerancia mide el
           error permitido en un punto, el rango de operación describe el
           alcance del parámetro. Se imprime como leyenda en cada gráfica.

           IMPORTANTE: estos valores son un punto de partida genérico.
           REVÍSALOS contra el manual del fabricante y el procedimiento de
           calibración de cada contrato antes de firmar documentos.
           La clave se busca dentro del nombre del parámetro (sin acentos ni
           mayúsculas) y manda la PRIMERA regla que coincida, por lo que las
           claves más específicas van primero.
           ============================================================ */
        const RANGOS_OPERACION = [
            { clave: 'frecuencia cardiaca',   min: 30,  max: 250,  unidad: 'lpm'   },
            { clave: 'frecuencia respiratoria', min: 5, max: 60,   unidad: 'rpm'   },
            { clave: 'frecuencia',            min: 30,  max: 250,  unidad: 'lpm'   },
            { clave: 'pani',                  min: 0,   max: 300,  unidad: 'mmHg'  },
            { clave: 'nibp',                  min: 0,   max: 300,  unidad: 'mmHg'  },
            { clave: 'presion arterial',      min: 0,   max: 300,  unidad: 'mmHg'  },
            { clave: 'presion no invasiva',   min: 0,   max: 300,  unidad: 'mmHg'  },
            { clave: 'tension arterial',      min: 0,   max: 300,  unidad: 'mmHg'  },
            { clave: 'spo2',                  min: 70,  max: 100,  unidad: '%'     },
            { clave: 'temperatura',           min: 25,  max: 45,   unidad: '°C'    },
            { clave: 'energia',               min: 1,   max: 360,  unidad: 'J'     },
            { clave: 'peep',                  min: 0,   max: 20,   unidad: 'cmH2O' },
            { clave: 'volumen',               min: 20,  max: 1500, unidad: 'mL'    },
            { clave: 'flujo',                 min: 0,   max: 15,   unidad: 'L/min' }
            // Agrega aquí los parámetros propios de tus contratos:
            // { clave: 'etco2', min: 0, max: 99, unidad: 'mmHg' },
        ];

        /* v3.0: rangos de trabajo capturados por el ingeniero en la orden.
           Se llenan al abrir cada rutina y MANDAN sobre la tabla genérica de
           arriba: lo que se midió en sitio describe mejor el equipo que un
           valor de catálogo. Clave = nombre del parámetro normalizado. */
        let rangosCapturados = new Map();

        const claveParametro = (nombre) => normalizar(String(nombre || '').toLowerCase()).trim();

        /* El renglón de rango puede nombrar al parámetro ("ECG") mientras que
           las mediciones lo escriben con su unidad ("ECG (BPM)"). Por eso la
           búsqueda es por contención en ambos sentidos, con un mínimo de tres
           caracteres para no emparejar por casualidad. */
        function rangoCapturadoDe(nombre) {
            const n = claveParametro(nombre);
            if (!n) return null;
            if (rangosCapturados.has(n)) return rangosCapturados.get(n);
            for (const [k, v] of rangosCapturados) {
                if (k.length >= 3 && (n.includes(k) || k.includes(n))) return v;
            }
            return null;
        }

        /* Rango vigente para un parámetro. 'comp' es el índice del componente:
           en la PANI, 0 = sistólica y 1 = diastólica, cada una con su propio
           extremo cuando el rango se capturó compuesto (10/30 – 220/260). */
        function rangoOperacion(nombre, comp) {
            const cap = rangoCapturadoDe(nombre);
            if (cap && cap.soloTexto) return null;   // relación: no se puede situar en un eje
            if (cap) {
                const i = Number.isInteger(comp) ? comp : 0;
                const min = (cap.minPartes[i] !== undefined) ? cap.minPartes[i] : cap.minPartes[0];
                const max = (cap.maxPartes[i] !== undefined) ? cap.maxPartes[i] : cap.maxPartes[0];
                return { min: min, max: max, unidad: cap.unidad, capturado: true, fuente: cap };
            }
            const n = normalizar(String(nombre || '')).toLowerCase();
            const r = RANGOS_OPERACION.find(x => n.includes(x.clave));
            return r ? { min: r.min, max: r.max, unidad: r.unidad, capturado: false } : null;
        }

        // ¿El rango vino de la orden o de la tabla de configuración?
        function origenRangoOperacion(nombre) {
            return rangoCapturadoDe(nombre) ? 'orden' : 'configuracion';
        }

        function textoRangoOperacion(nombre, comp) {
            const cap = rangoCapturadoDe(nombre);
            if (cap && cap.soloTexto) return textoRangoCapturado(cap);
            if (cap && !Number.isInteger(comp)) return textoRangoCapturado(cap);
            const r = rangoOperacion(nombre, comp);
            if (!r) return 'No capturado en la orden ni definido en la configuración';
            return redondear(r.min) + ' – ' + redondear(r.max) + (r.unidad ? ' ' + r.unidad : '');
        }

        /* ============================================================
           v2.7 — VALORES COMPUESTOS (PANI 120/80)
           "120/80"    → [120, 80]      sistólica / diastólica
           "120/80/93" → [120, 80, 93]  agrega presión media
           "5 L/min"   → [5]            la barra es unidad, no separador
           "N/A", "1:2"→ []             no comparables
           ============================================================ */
        const CLAVES_PRESION = ['pani', 'nibp', 'ibp', 'presion arterial',
                                'presion no invasiva', 'tension arterial'];

        const SUBETIQUETAS_PRESION = {
            2: ['Sistólica', 'Diastólica'],
            3: ['Sistólica', 'Diastólica', 'Media']
        };

        function esParametroPresion(nombre) {
            const n = normalizar(String(nombre || '')).toLowerCase();
            return CLAVES_PRESION.some(k => n.includes(k));
        }

        function etiquetasComponentes(nombre, cantidad) {
            if (esParametroPresion(nombre) && SUBETIQUETAS_PRESION[cantidad]) {
                return SUBETIQUETAS_PRESION[cantidad];
            }
            return Array.from({ length: cantidad }, (_, i) => 'Componente ' + (i + 1));
        }

        // Convierte "0.3 A", "128,4" o "85" a número
        function aNumeroSimple(v) {
            const s = String(v ?? '').trim();
            if (!s || s === '—') return null;
            const m = s.replace(',', '.').match(/-?\d+(\.\d+)?/);
            return m ? parseFloat(m[0]) : null;
        }

        function medicionAPartes(v) {
            const s = String(v ?? '').trim();
            if (!s || s === '—') return [];
            if (s.includes(':')) return [];   // relaciones I:E siguen fuera de la gráfica

            // Solo es compuesto si CADA tramo empieza con número; así "5 L/min",
            // "mL/h" o "N/A" no confunden la unidad con una diastólica.
            const trozos = s.split('/').map(t => t.trim()).filter(t => t !== '');
            const esCompuesto = trozos.length > 1 && trozos.length <= 3 &&
                                trozos.every(t => /^[-+]?\d/.test(t));

            if (!esCompuesto) {
                const n = aNumeroSimple(s);
                return n === null ? [] : [n];
            }
            const nums = trozos.map(aNumeroSimple);
            return nums.every(n => n !== null) ? nums : [];
        }

        // Compatibilidad: sigue devolviendo null para valores compuestos
        function aNumeroMedicion(v) {
            const p = medicionAPartes(v);
            return p.length === 1 ? p[0] : null;
        }

        function parsearMediciones(texto) {
            const partes = normalizar(texto).split(/medicion\s*:/i);
            if (partes.length < 2) return null;
            const originalPartes = texto.split(/medici[oó]n\s*:/i);

            const filas = [];
            for (let i = 1; i < partes.length; i++) {
                const segNorm = partes[i];
                const segOrig = originalPartes[i] || segNorm;
                /* v3.0: el nombre termina en la PRIMERA etiqueta de campo, sea
                   cual sea. Antes solo cortaba en "Valor Programado", así que
                   un bloque con rango de trabajo arrastraba ese texto dentro
                   del nombre del parámetro. */
                let nombre = segOrig.split(/,?\s*(?:valor\s+(?:programado|desplegado|medido)|rango\s+de\s+(?:trabajo|operacion|operación)|rango)\s*:/i)[0] || '';
                nombre = nombre.replace(/[,\s]+$/, '').trim();
                filas.push({
                    nombre: nombre || ('Parámetro ' + i),
                    // v3.0: rango de trabajo capturado dentro del mismo bloque
                    rango: extraerCampoLibre(segOrig, ['rango de trabajo', 'rango de operacion', 'rango']),
                    programado: extraerCampoMedicion(segOrig, 'programado'),
                    desplegado: extraerCampoMedicion(segOrig, 'desplegado'),
                    medido: extraerCampoMedicion(segOrig, 'medido')
                });
            }
            return filas.length > 0 ? filas : null;
        }

        /* v3.0: vuelca a la sección III lo que el ingeniero capturó en campo.
           Los campos siguen siendo editables: si el dato viene mal escrito
           desde la orden, se corrige aquí antes de imprimir. */
        /* v3.0.1: en la sección III la unidad ya está impresa al lado, así que
           el campo guarda solo el número. "16°C" → "16", "77 %" → "77". */
        function soloNumeroAmbiental(v) {
            const t = String(v ?? '').trim();
            if (!t) return '';
            const m = t.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
            return m ? m[0] : t;
        }

        function aplicarCondicionesAmbientales(amb) {
            const elTemp = document.getElementById('rutTemperatura');
            const elHum  = document.getElementById('rutHumedad');
            const nota   = document.getElementById('rutAmbientalOrigen');

            elTemp.innerText = soloNumeroAmbiental(amb.temperatura);
            elHum.innerText  = soloNumeroAmbiental(amb.humedad);

            if (amb.temperatura || amb.humedad) {
                nota.innerText = 'Tomado de la captura del ingeniero en la orden (' +
                                 amb.origen.join(' · ') + '). Editable si requiere corrección.';
                nota.classList.remove('hidden');
            } else {
                nota.classList.add('hidden');
            }
        }

        /* ============================================================
           v3.0 — SEPARACIÓN DE LO QUE VIENE EN "VALORES DE MEDICIÓN"

           El ingeniero captura, en este orden:
             1) temperatura ambiente y humedad relativa del sitio
             2) el rango de trabajo de cada parámetro
             3) los valores de medición propiamente dichos

           Esta función separa los tres bloques. Formatos que reconoce
           (cualquiera sirve; elige el que mejor se acomode al formulario):

           CONDICIONES AMBIENTALES
             Medicion: Temperatura ambiente, Valor Medido: 22.5
             Medicion: Humedad relativa, Valor Medido: 48
           Se identifican por el nombre. Para no confundirlas con un parámetro
           real del equipo (una incubadora SÍ mide temperatura), solo se sacan
           de la tabla cuando el nombre dice "ambiente/ambiental/del sitio/de
           la sala" o cuando aparecen entre los DOS PRIMEROS bloques de la
           captura, que es el orden acordado.

           RANGO DE TRABAJO — dos formas:
             a) dentro del bloque del parámetro
                Medicion: PANI, Rango de trabajo: 0-300, Valor Programado: 120…
             b) como bloque propio antes de las mediciones
                Medicion: Rango de trabajo PANI, Valor Medido: 0-300
                Medicion: Rango PANI, Valor Programado: 0, Valor Medido: 300
           ============================================================ */
        const CLAVES_AMBIENTE = ['ambiente', 'ambiental', 'del sitio', 'de la sala', 'del area', 'del área'];
        const POSICIONES_AMBIENTE = 2;   // cuántos bloques iniciales se revisan

        function esNombreTemperatura(n) { return n.includes('temperatura') || /\btemp\b/.test(n); }
        function esNombreHumedad(n)     { return n.includes('humedad'); }

        function primerValor(f) {
            return valorCelda(f.medido) || valorCelda(f.desplegado) || valorCelda(f.programado) || '';
        }

        /* v3.5 — La unidad declarada entre paréntesis, normalizada para poder
           compararla: "(cmH20)" y "(cmH2O)" son la misma, y "(L/min)" y "(L/m)"
           también. El cero y la letra O se unifican porque los ingenieros usan
           ambos indistintamente al capturar. */
        function unidadDeNombre(nombre) {
            const m = String(nombre || '').match(/\(([^)]*)\)\s*$/);
            return normalizarUnidad(m ? m[1] : '');
        }

        function normalizarUnidad(u) {
            return normalizar(String(u || ''))
                .toLowerCase()
                .replace(/0/g, 'o')
                .replace(/[^a-z%]/g, '');
        }

        /* ¿La unidad del renglón es compatible con la del rango? Si alguna de
           las dos no se declaró, se acepta: no hay elementos para descartarla.
           Esto evita que un renglón de temperatura herede, por estar debajo,
           el rango de flujo del encabezado anterior. */
        function unidadesCompatibles(unidadFila, unidadRango) {
            if (!unidadFila || !unidadRango) return true;
            return unidadFila.indexOf(unidadRango) === 0 || unidadRango.indexOf(unidadFila) === 0;
        }

        function separarBloquesMedicion(filas) {
            const ambientales = { temperatura: '', humedad: '', origen: [] };
            const rangos = new Map();
            const mediciones = [];
            let rangoVigente = null;      // el último renglón de rango leído

            filas.forEach((f, idx) => {
                const n = claveParametro(f.nombre);
                const explicito = CLAVES_AMBIENTE.some(k => n.includes(normalizar(k)));
                const enCabeza = idx < POSICIONES_AMBIENTE;

                // --- 1. Condiciones ambientales ---
                // El valor puede venir en una columna o dentro del propio nombre
                if (esNombreHumedad(n) && (explicito || enCabeza || n.includes('relativa'))) {
                    if (!ambientales.humedad) {
                        ambientales.humedad = primerValor(f) || valorDesdeNombre(f.nombre);
                        ambientales.origen.push(f.nombre);
                        return;
                    }
                }
                if (esNombreTemperatura(n) && (explicito || enCabeza)) {
                    if (!ambientales.temperatura) {
                        ambientales.temperatura = primerValor(f) || valorDesdeNombre(f.nombre);
                        ambientales.origen.push(f.nombre);
                        return;
                    }
                }

                // --- 2. Renglón de rango estándar de operación ---
                if (/^rango\b/.test(n)) {
                    let r = parsearRangoEstandar(f.nombre);
                    if (!r) {
                        // variante: el rango viene en las columnas de valor
                        const izq = aNumeroSimple(f.programado);
                        const der = aNumeroSimple(f.medido) ?? aNumeroSimple(f.desplegado);
                        const enTexto = parsearRangoEstandar('rango ' + primerValor(f));
                        if (enTexto) r = enTexto;
                        else if (izq !== null && der !== null) {
                            r = { param: '', minPartes: [Math.min(izq, der)], maxPartes: [Math.max(izq, der)],
                                  unidad: '', texto: izq + ' – ' + der };
                        }
                    }
                    if (r) {
                        rangoVigente = r;
                        // Si nombró al parámetro, queda registrado por nombre;
                        // si no, aplica a las mediciones que vienen abajo.
                        if (r.param) rangos.set(claveParametro(r.param), r);
                    }
                    return;   // el renglón es un encabezado, no una medición
                }

                // --- 3. Medición ---
                // Rango escrito dentro del propio bloque del parámetro
                if (f.rango) {
                    const propio = parsearRangoEstandar('rango ' + f.rango);
                    if (propio) rangos.set(n, propio);
                } else if (rangoVigente && analizarFila(f).comparable &&
                           unidadesCompatibles(unidadDeNombre(f.nombre), normalizarUnidad(rangoVigente.unidad))) {
                    /* Hereda el rango del encabezado anterior. Se exige que la
                       medición sea comparable para no arrastrar el rango de
                       energía a un renglón con una sola lectura suelta, como
                       "Tiempo de carga max (s)".
                       v3.5: como ahora también es comparable un renglón de
                       desplegado contra medido, parámetros como P Max o P media
                       —que nunca traen valor programado— por fin heredan el
                       rango de su encabezado. Antes se quedaban en "—". */
                    if (!rangos.has(n)) rangos.set(n, rangoVigente);
                }
                mediciones.push(f);
            });

            return { ambientales: ambientales, rangos: rangos, mediciones: mediciones };
        }

        /* ============================================================
           MODAL DE RUTINA
           ============================================================ */
        function abrirRutina(id) {
            /* v3.7: la rutina se genera tanto desde Preventivos como desde
               Calibraciones, así que se busca en ambos conjuntos. Antes solo
               miraba los preventivos y el botón de calibración no hacía nada. */
            const eq = dataPreventivos.find(d => d.ID === id) ||
                       dataCalibraciones.find(d => d.ID === id);
            if (!eq) return;

            const modal = document.getElementById('modalRutina');
            document.body.classList.add('printing-modal');

            /* v2.9: dos fechas.
               · Medición: la de la orden de trabajo (cuándo se ejecutó el servicio)
               · Emisión:  hoy, el día en que se genera este documento */
            document.getElementById('rutFecha').innerText =
                eq.FechaEjecucionStr !== 'Sin Fecha Registrada' ? eq.FechaEjecucionStr : 'Sin fecha registrada';
            document.getElementById('rutFechaEmision').innerText = new Date().toLocaleDateString('es-MX');
            // FIX: el folio es siempre trazable al ID de la orden (antes: número aleatorio)
            document.getElementById('rutFolio').innerText = (eq.ID && eq.ID !== 'S/N') ? eq.ID : 'SIN FOLIO';

            document.getElementById('rutCliente').innerText = clienteActual;
            document.getElementById('rutDir').innerText = document.getElementById('clienteDireccion').innerText;
            document.getElementById('rutTel').innerText = document.getElementById('clienteTelefono').innerText;
            document.getElementById('rutArea').innerText = eq.Area;

            document.getElementById('rutEq').innerText = eq.Equipo;
            // v3.5: el tipo de equipo define la tolerancia de toda la rutina
            equipoRutinaActual = eq.Equipo || '';
            document.getElementById('rutMarca').innerText = eq.Marca;
            document.getElementById('rutModelo').innerText = eq.Modelo;
            document.getElementById('rutSerie').innerText = eq.Serie;
            document.getElementById('rutInv').innerText = eq.Inventario;
            document.getElementById('rutIng').innerText = eq.Ingeniero;
            document.getElementById('rutProx').innerText = eq.ProximoMantStr;
            // v2.9: certificado y vigencia del patrón, tomados del catálogo
            renderDatosPatron(eq.EquipoCalibracion);

            // v3.0: las condiciones ambientales llegan desde la tabla de
            // mediciones de la orden (primeras capturas). Se limpian aquí y se
            // llenan más abajo, al procesar la sección VI; siguen siendo
            // editables por si hubo un error de dedo en campo.
            document.getElementById('rutTemperatura').innerText = '';
            document.getElementById('rutHumedad').innerText = '';
            document.getElementById('rutAmbientalOrigen').classList.add('hidden');
            rangosCapturados = new Map();

            // Checklist (FIX: sin pre-aprobar; el documento debe llenarse conscientemente)
            const rutActividades = document.getElementById('rutActividades');
            const actividadesEstandar = [
                "Limpieza integral exterior e interior del equipo",
                "Revisión de integridad física y mecánica (carcasas, soportes, ruedas)",
                "Verificación del estado de cables, conectores y enchufes",
                "Pruebas de encendido y ejecución de autodiagnóstico",
                "Comprobación de alarmas visuales y sonoras",
                "Verificación de parámetros y pruebas funcionales básicas",
                "Pruebas de seguridad eléctrica",
                "Calibración / Ajuste contra patrón de referencia"
            ];

            let checklistHTML = '<table class="w-full text-sm text-left border-collapse border border-slate-200"><thead class="bg-slate-100"><tr><th class="border border-slate-200 p-2">Actividad a realizar</th><th class="border border-slate-200 p-2 text-center w-24">Aprobado</th><th class="border border-slate-200 p-2 text-center w-24">Rechazado</th><th class="border border-slate-200 p-2 text-center w-16">N/A</th></tr></thead><tbody>';

            actividadesEstandar.forEach((act, i) => {
                checklistHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="border border-slate-200 p-2 font-medium text-slate-700">${esc(act)}</td>
                        <td class="border border-slate-200 p-2 text-center"><input type="radio" name="chk_${i}" class="w-4 h-4 text-brand-600 focus:ring-brand-500 cursor-pointer"></td>
                        <td class="border border-slate-200 p-2 text-center"><input type="radio" name="chk_${i}" class="w-4 h-4 text-red-600 focus:ring-red-500 cursor-pointer"></td>
                        <td class="border border-slate-200 p-2 text-center"><input type="radio" name="chk_${i}" class="w-4 h-4 text-slate-400 focus:ring-slate-400 cursor-pointer"></td>
                    </tr>
                `;
            });
            checklistHTML += '</tbody></table>';
            rutActividades.innerHTML = checklistHTML;

            // ===== Sección V: Valores de Medición (editable) =====
            const valoresContainer = document.getElementById('rutinaValoresContainer');

            // Estado de edición: se reinicia con cada rutina nueva
            rutinaFilasActuales = null;
            rutinaFilasOriginales = null;
            rutinaLecturasActuales = null;
            rutinaLecturasOriginales = null;
            reiniciarNotaModificacion();

            destruirGraficasRutina();

            const textMedicion = String(eq.ValoresMedicion || '').trim();

            if (textMedicion && textMedicion !== 'undefined' && textMedicion !== 'N/A') {
                valoresContainer.style.display = 'block';

                const filas = parsearMediciones(textMedicion);

                if (filas) {
                    /* ---- Formato estructurado de Jotform ----
                       v3.0: antes de armar la tabla se separan las primeras
                       capturas (temperatura y humedad) y los rangos de trabajo;
                       solo lo que queda son mediciones comparables. */
                    const bloques = separarBloquesMedicion(filas);
                    rangosCapturados = bloques.rangos;
                    aplicarCondicionesAmbientales(bloques.ambientales);

                    const utiles = bloques.mediciones;
                    rutinaFilasActuales = utiles.map(f => ({ ...f }));
                    rutinaFilasOriginales = utiles.map(f => ({ ...f }));

                    if (utiles.length === 0) {
                        // Solo se capturaron ambientales y/o rangos
                        document.getElementById('rutinaTablaContainer').innerHTML =
                            '<p class="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">' +
                            'La orden no registró valores de medición comparables además de las condiciones ambientales y los rangos de trabajo.</p>';
                        document.getElementById('rutinaGraficasContainer').style.display = 'none';
                    } else {
                        renderTablaMediciones();
                        construirGraficasMediciones();
                    }
                } else {
                    // ---- Fallback: texto libre sin el formato "Medicion:" ----
                    // Solo tabla de lecturas (editable); sin gráfica porque no hay valores comparables.
                    const nums = textMedicion.match(/-?\d+(\.\d+)?/g);
                    if (nums && nums.length > 0) {
                        rutinaLecturasActuales = nums.map(n => String(parseFloat(n)));
                        rutinaLecturasOriginales = rutinaLecturasActuales.slice();
                        renderTablaLecturas();
                        document.getElementById('rutinaGraficasContainer').style.display = 'none';
                    } else {
                        document.getElementById('rutinaTablaContainer').innerHTML = '<p class="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">El registro no contiene valores numéricos estructurados para generar tabla dinámica.</p>';
                        document.getElementById('rutinaGraficasContainer').style.display = 'none';
                    }
                }
            } else {
                valoresContainer.style.display = 'none';
            }

            // ===== Sección VI: Observaciones =====
            // Campo de texto libre para observaciones del servicio;
            // se limpia al abrir cada rutina nueva.
            document.getElementById('rutObservaciones').innerText = '';

            // ===== Sección VII: Autorización =====
            // Campo editable para escribir el nombre del responsable autorizado
            // antes de imprimir; se limpia al abrir cada rutina nueva.
            document.getElementById('rutNombreAutorizado').innerText = '';

            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        function cerrarRutina() {
            document.body.classList.remove('printing-modal');
            document.getElementById('modalRutina').classList.add('hidden');
            document.getElementById('modalRutina').classList.remove('flex');
        }

        /* ============================================================
           SECCIÓN V EDITABLE: TABLA DE MEDICIONES, GRÁFICA Y NOTA
           ============================================================ */

        // Normaliza el texto de una celda editable ('—' equivale a vacío)
        function valorCelda(txt) {
            const t = String(txt || '').trim();
            return (t === '—') ? '' : t;
        }

        /* ============================================================
           v3.0 — EL ERROR SE EXPRESA COMO PORCENTAJE
           error % = (valor real − valor programado) / valor programado × 100

           El denominador es el VALOR PROGRAMADO, que es el valor verdadero de
           referencia: lo que se ajustó en el patrón/simulador. El numerador es
           lo que desplegó o midió el equipo bajo prueba.

           v3.0.1: el documento imprime el ERROR ABSOLUTO PORCENTUAL, es decir
           sin signo: lo que se evalúa es la magnitud de la desviación. Con la
           constante en false se conserva el signo, que indica la dirección del
           desvío (si el equipo lee alto o bajo) y es útil para ajustar.
           El valor de referencia es el programado; el valor real es el MEDIDO
           y, cuando la orden no lo capturó, el DESPLEGADO.

           Caso especial: cuando el valor programado es 0 el porcentaje no está
           definido (división entre cero). En ese renglón se imprime el error
           absoluto y se marca con "abs." para que quede claro por qué.
           ============================================================ */
        const ERROR_PORCENTUAL_ABSOLUTO = true;

        // v2.7: analiza una fila y devuelve el error DE CADA COMPONENTE.
        // Un valor simple produce un componente; una PANI 120/80 produce dos.
        /* ============================================================
           v3.5 — QUÉ SE COMPARA CONTRA QUÉ

           Hasta la 3.4 solo se evaluaba cuando existía valor PROGRAMADO, así
           que un renglón con desplegado y medido —muy común en temperatura,
           presión de vía aérea o flujo, donde no se programa nada— se quedaba
           sin error y sin gráfica.

           Ahora hay dos situaciones y en ambas se evalúa:

           A) Con valor programado. El programado es el valor verdadero: es lo
              que se ajustó en el patrón. Se compara contra lo que respondió el
              equipo (medido y, si no hay, desplegado).

           B) Sin valor programado. El verdadero es el MEDIDO, que es la
              lectura del analizador calibrado, y lo que se evalúa es lo que
              DESPLEGÓ el equipo bajo prueba.

           Si solo existe una de las tres columnas no hay nada que comparar y
           el renglón se queda sin error, como antes.
           ============================================================ */
        function analizarFila(f) {
            const prog = medicionAPartes(f.programado);
            const desp = medicionAPartes(f.desplegado);
            const med  = medicionAPartes(f.medido);

            let ref, comp, origenRef, origenComp;

            if (prog.length && (med.length || desp.length)) {
                ref = prog;  origenRef = 'Programado';
                comp = med.length ? med : desp;
                origenComp = med.length ? 'Medido' : 'Desplegado';
            } else if (desp.length && med.length) {
                ref = med;   origenRef = 'Medido';
                comp = desp; origenComp = 'Desplegado';
            } else {
                return { comparable: false, compuesto: false, componentes: [] };
            }

            const n = Math.min(ref.length, comp.length);
            const etiquetas = etiquetasComponentes(f.nombre, n);
            const componentes = [];

            for (let i = 0; i < n; i++) {
                // v2.9: todos los cálculos se limitan a 2 decimales
                const error = redondear(comp[i] - ref[i]);
                componentes.push({
                    idx: i,
                    etiqueta: n > 1 ? etiquetas[i] : '',
                    prog: ref[i],            // valor de referencia (nombre conservado)
                    ref: ref[i],
                    desp: desp[i] ?? null,
                    med: med[i] ?? null,
                    real: comp[i],           // valor evaluado
                    error: error,
                    // v3.0: el porcentaje es el error principal del documento
                    errorPct: ref[i] !== 0 ? redondear((error / ref[i]) * 100) : null,
                    errorRel: ref[i] !== 0 ? redondear((error / ref[i]) * 100) : null,
                    fuera: fueraDeTolerancia(f.nombre, ref[i], error)
                });
            }
            return {
                comparable: true, compuesto: n > 1,
                origen: origenComp,          // qué columna se evaluó
                origenRef: origenRef,        // contra qué columna
                componentes: componentes
            };
        }

        /* v2.9: el número se limita a 2 decimales.
           v3.0.1: con ERROR_PORCENTUAL_ABSOLUTO el documento no imprime signos,
           ni en el porcentaje ni en el error en unidades del parámetro. */
        const fmtError = (e) => {
            if (ERROR_PORCENTUAL_ABSOLUTO) return String(redondear(Math.abs(e)));
            return (e > 0 ? '+' : '') + redondear(e);
        };

        /* v3.0 — Texto del error porcentual de un componente.
           Devuelve '+4.17 %'  ·  '-2.5 %'  ·  '4.17 %' si se pidió sin signo
           y '+5 (abs.)' cuando el programado es 0 y el porcentaje no existe. */
        function fmtErrorPct(c) {
            if (c.errorPct === null || c.errorPct === undefined) {
                return fmtError(c.error) + ' (abs.)';
            }
            const v = ERROR_PORCENTUAL_ABSOLUTO ? Math.abs(c.errorPct) : c.errorPct;
            return (!ERROR_PORCENTUAL_ABSOLUTO && v > 0 ? '+' : '') + redondear(v) + ' %';
        }

        // Contenido de la celda "Error": un número si el valor es simple,
        // un renglón por componente si es compuesto (Sistólica / Diastólica)
        function celdaErrorFila(f) {
            const a = analizarFila(f);
            const tol = textoTolerancia(f.nombre);

            if (!a.comparable) {
                return { html: '<span class="text-slate-400">—</span>', cls: 'p-3 text-center', title: '' };
            }
            // v3.0: la celda muestra el error PORCENTUAL; el error absoluto
            // queda en el tooltip y en el renglón de desglose.
            const unidad = (toleranciaParaParametro(f.nombre).unidad) || '';
            const u = unidad ? ' ' + unidad : '';

            if (!a.compuesto) {
                const c = a.componentes[0];
                return {
                    html: '<span class="' + (c.fuera ? 'text-red-600 font-bold' : 'text-slate-700') + '">' + (c.fuera ? '⚠ ' : '') + fmtErrorPct(c) + '</span>',
                    cls: 'p-3 text-center ' + (c.fuera ? 'bg-red-50' : ''),
                    title: 'Error absoluto ' + fmtError(c.error) + u + ' · tolerancia ' + tol +
                           ' · ' + a.origen + ' contra ' + a.origenRef
                };
            }
            const filas = a.componentes.map(c =>
                '<div class="flex items-baseline justify-between gap-3 text-xs leading-snug">' +
                    '<span class="text-slate-500">' + esc(c.etiqueta) + '</span>' +
                    '<span class="' + (c.fuera ? 'text-red-600 font-bold' : 'text-slate-700 font-semibold') + '">' +
                        (c.fuera ? '⚠ ' : '') + fmtErrorPct(c) + '</span>' +
                '</div>'
            ).join('');
            return {
                html: filas,
                cls: 'p-3 ' + (a.componentes.some(c => c.fuera) ? 'bg-red-50' : ''),
                title: 'Error absoluto ' +
                       a.componentes.map(c => c.etiqueta + ' ' + fmtError(c.error) + u).join(' · ') +
                       ' · tolerancia ' + tol + ' · ' + a.origen + ' contra ' + a.origenRef
            };
        }

        // Se conserva el nombre anterior por compatibilidad
        function calcularErrorFila(f) {
            const c = celdaErrorFila(f);
            return { txt: c.html.replace(/<[^>]+>/g, ' ').trim(), cls: c.cls };
        }

        /* v3.0: texto que se muestra en la columna "Rango de trabajo".
           Prioridad: lo capturado en la orden → lo definido en configuración →
           guion. Se marca con * lo que NO vino de la orden, para que quien
           revisa el documento sepa qué dato es de campo y cuál es de catálogo. */
        function textoRangoTrabajoFila(f) {
            const cap = rangoCapturadoDe(f.nombre);
            if (cap) return textoRangoCapturado(cap);
            /* Sin rango capturado, el de configuración solo se ofrece cuando la
               medición es comparable. De otro modo un renglón como "Tiempo de
               carga max energía 200 J (s)" —que se mide en segundos— heredaría
               por su nombre el rango de energía en joules. */
            if (!analizarFila(f).comparable) return '—';
            const r = rangoOperacion(f.nombre);
            if (!r) return '—';
            return redondear(r.min) + ' – ' + redondear(r.max) +
                   (r.unidad ? ' ' + r.unidad : '') + ' *';
        }

        // Dibuja la tabla estructurada con celdas editables.
        // v2.7: los valores compuestos agregan un renglón guía con el desglose
        // por componente, que también se imprime.
        function renderTablaMediciones() {
            const editCls = 'p-3 outline-none focus:bg-brand-50 focus:ring-1 focus:ring-brand-300 transition-colors cursor-text';
            let tablaHTML = '<table class="min-w-full text-sm text-left border-collapse"><thead class="bg-slate-800 text-white"><tr><th class="p-3 font-semibold rounded-tl-lg">Parámetro</th><th class="p-3 font-semibold">Rango estándar de operación</th><th class="p-3 font-semibold">Programado</th><th class="p-3 font-semibold">Desplegado</th><th class="p-3 font-semibold">Medido</th><th class="p-3 font-semibold text-center rounded-tr-lg">Error (%)</th></tr></thead><tbody class="divide-y divide-slate-200 bg-white">';

            rutinaFilasActuales.forEach((f, idx) => {
                const err = celdaErrorFila(f);
                const a = analizarFila(f);
                tablaHTML += `<tr class="hover:bg-slate-50 transition-colors">
                    <td contenteditable="true" spellcheck="false" data-edit-campo="nombre" data-idx="${idx}" class="${editCls} font-medium text-slate-800">${esc(f.nombre)}</td>
                    <td contenteditable="true" spellcheck="false" data-edit-campo="rango" data-idx="${idx}" class="${editCls} text-slate-600 whitespace-nowrap">${esc(textoRangoTrabajoFila(f))}</td>
                    <td contenteditable="true" spellcheck="false" data-edit-campo="programado" data-idx="${idx}" class="${editCls}">${esc(f.programado || '—')}</td>
                    <td contenteditable="true" spellcheck="false" data-edit-campo="desplegado" data-idx="${idx}" class="${editCls}">${esc(f.desplegado || '—')}</td>
                    <td contenteditable="true" spellcheck="false" data-edit-campo="medido" data-idx="${idx}" class="${editCls} font-semibold">${esc(f.medido || '—')}</td>
                    <td data-err-idx="${idx}" class="${err.cls}" title="${esc(err.title)}">${err.html}</td>
                </tr>`;
                if (a.compuesto) {
                    tablaHTML += '<tr class="bg-slate-50 text-xs text-slate-500">' +
                        '<td class="py-1.5 pl-8 italic" colspan="5">' +
                            a.componentes.map(c =>
                                esc(c.etiqueta) + ': programado ' + c.prog + ' · real ' + c.real +
                                ' · error ' + fmtError(c.error) + ' (' + fmtErrorPct(c) + ')' +
                                (c.fuera ? ' — fuera de tolerancia' : '')
                            ).join('&nbsp;&nbsp;|&nbsp;&nbsp;') +
                        '</td><td class="py-1.5"></td></tr>';
                }
            });
            tablaHTML += '</tbody></table>' +
                '<p class="text-xs text-slate-400 mt-2 italic">Tolerancia aplicada: ' + esc(textoToleranciaCompleto('')) + '. ' +
                'Los rangos marcados con * no se capturaron en la orden: provienen de la tabla de configuración del sistema. ' +
                'El error se expresa como porcentaje respecto al valor de referencia: cuando hay valor programado, ese es la referencia ' +
                'y se evalúa el medido (o el desplegado si no hay medido); cuando no hay programado, la referencia es el medido ' +
                'del analizador y se evalúa el desplegado por el equipo. ' +
                'Los valores compuestos (p. ej. PANI 120/80) se evalúan y grafican por componente.</p>';
            document.getElementById('rutinaTablaContainer').innerHTML = tablaHTML;
        }

        // Dibuja la tabla de lecturas sueltas (fallback) con valores editables
        function renderTablaLecturas() {
            const editCls = 'p-3 outline-none focus:bg-brand-50 focus:ring-1 focus:ring-brand-300 transition-colors cursor-text font-semibold text-brand-700';
            let tablaHTML = '<table class="min-w-full text-sm text-left border-collapse"><thead class="bg-slate-800 text-white"><tr><th class="p-3 font-semibold rounded-tl-lg">Lectura</th><th class="p-3 font-semibold rounded-tr-lg">Valor Registrado</th></tr></thead><tbody class="divide-y divide-slate-200 bg-white">';
            rutinaLecturasActuales.forEach((v, i) => {
                tablaHTML += `<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 font-medium text-slate-800">Lectura ${i + 1}</td><td contenteditable="true" spellcheck="false" data-edit-campo="lectura" data-idx="${i}" class="${editCls}">${esc(v)}</td></tr>`;
            });
            tablaHTML += '</tbody></table>';
            document.getElementById('rutinaTablaContainer').innerHTML = tablaHTML;
        }

        /* ============================================================
           v2.8 — UNA GRÁFICA POR PARÁMETRO DE MEDICIÓN
           Antes todos los parámetros compartían una sola gráfica combinada, lo
           que mezclaba magnitudes distintas (mmHg con J con °C) en un mismo eje.
           Ahora cada parámetro genera su propia tarjeta con:
             · barras Programado vs Real (roja si sale de tolerancia)
             · banda verde sombreada = intervalo aceptable (programado ± tolerancia)
             · líneas punteadas = límites del rango estándar de operación
             · leyenda impresa con tolerancia y rango de operación
           Los valores compuestos (PANI 120/80) se grafican por componente
           dentro de la gráfica de ESE parámetro.
           ============================================================ */

        // Plugin de dibujo: banda de tolerancia y límites de operación
        const pluginBandasMedicion = {
            id: 'bandasMedicion',
            beforeDatasetsDraw(chart, args, opts) {
                const cfg = (chart.options.plugins && chart.options.plugins.bandasMedicion) || {};
                const bandas = cfg.bandas || [];
                const rango  = cfg.rango || null;
                const x = chart.scales.x, y = chart.scales.y;
                if (!x || !y) return;
                const area = chart.chartArea;
                const ctx = chart.ctx;
                ctx.save();

                // Banda aceptable por categoría (programado ± tolerancia)
                bandas.forEach((b, i) => {
                    const centro = x.getPixelForValue(i);
                    const ancho = Math.max(24, (area.right - area.left) / Math.max(bandas.length, 1) * 0.72);
                    const yTop = y.getPixelForValue(b.max);
                    const yBot = y.getPixelForValue(b.min);
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.13)';
                    ctx.fillRect(centro - ancho / 2, yTop, ancho, Math.max(2, yBot - yTop));
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);
                    ctx.strokeRect(centro - ancho / 2, yTop, ancho, Math.max(2, yBot - yTop));
                });

                // Límites del rango estándar de operación (solo si caen a la vista)
                if (rango) {
                    ctx.setLineDash([2, 3]);
                    ctx.strokeStyle = 'rgba(0, 93, 161, 0.65)';
                    ctx.fillStyle = 'rgba(0, 93, 161, 0.85)';
                    ctx.font = '9px Inter, sans-serif';
                    [['mín', rango.min], ['máx', rango.max]].forEach(([etq, v]) => {
                        const py = y.getPixelForValue(v);
                        if (py < area.top || py > area.bottom) return;   // fuera de vista: no se dibuja
                        ctx.beginPath();
                        ctx.moveTo(area.left, py);
                        ctx.lineTo(area.right, py);
                        ctx.stroke();
                        ctx.fillText('Operación ' + etq + ' ' + v, area.left + 4, py - 3);
                    });
                }
                ctx.restore();
            }
        };

        // Destruye todas las gráficas de la rutina en curso
        function destruirGraficasRutina() {
            chartsRutina.forEach(c => { try { c.destroy(); } catch (_) { } });
            chartsRutina = [];
        }

        /* Agrupa TODAS las mediciones de la tabla por parámetro.
           Si la sección V trae tres renglones "SPO2(%)", los tres son puntos de
           la MISMA gráfica (mediciones 1, 2 y 3). Los valores compuestos se
           separan: "PANI 120/80" alimenta dos grupos distintos, "PANI ·
           Sistólica" y "PANI · Diastólica". La clave de agrupación ignora
           acentos y mayúsculas, de modo que "SPO2" y "Spo2" caen en el mismo
           grupo; el nombre mostrado es el de la primera aparición. */
        function agruparParametrosMedicion() {
            const grupos = new Map();
            rutinaFilasActuales.forEach(f => {
                const a = analizarFila(f);
                if (!a.comparable) return;
                const nombreBase = String(f.nombre || '').trim();
                a.componentes.forEach(c => {
                    const clave = normalizar((nombreBase + '||' + (c.etiqueta || '')).toLowerCase());
                    if (!grupos.has(clave)) {
                        grupos.set(clave, {
                            nombre: nombreBase,               // se usa para tolerancia y rango
                            idxComp: c.idx || 0,              // v3.0.1: extremo del rango compuesto
                            etiqueta: c.etiqueta || '',
                            titulo: c.etiqueta ? nombreBase + ' · ' + c.etiqueta : nombreBase,
                            puntos: []
                        });
                    }
                    grupos.get(clave).puntos.push({ ...c, origen: a.origen });
                });
            });
            return Array.from(grupos.values());
        }

        // Leyenda impresa bajo cada gráfica: tolerancia, intervalo aceptable de
        // cada medición y rango estándar de operación del parámetro.
        function leyendaRangosParametro(grupo) {
            const tol = textoToleranciaCompleto(grupo.nombre);
            const cap = rangoCapturadoDe(grupo.nombre);
            const rangoTxt = textoRangoOperacion(grupo.nombre, grupo.idxComp);
            const unidad = (toleranciaParaParametro(grupo.nombre).unidad) || '';
            const u = unidad ? ' ' + unidad : '';

            // Si todas las mediciones comparten el mismo valor programado, basta
            // un intervalo; si no, se detalla cuál corresponde a cada medición.
            const intervalos = grupo.puntos.map(p => {
                const m = margenTolerancia(grupo.nombre, p.prog);
                return redondear(p.prog - m) + ' – ' + redondear(p.prog + m);
            });
            const todosIguales = intervalos.every(v => v === intervalos[0]);
            const textoIntervalo = todosIguales
                ? intervalos[0] + u
                : intervalos.map((v, i) => 'M' + (i + 1) + ': ' + v).join(' · ') + u;

            return '<p><span class="font-semibold text-slate-700">Tolerancia:</span> ' + esc(tol) +
                       ' <span class="text-slate-400">(' + grupo.puntos.length + ' ' +
                       (grupo.puntos.length === 1 ? 'medición' : 'mediciones') + ')</span></p>' +
                   '<p><span class="font-semibold text-slate-700">Intervalo aceptable (referencia ± tolerancia):</span> ' + textoIntervalo + '</p>' +
                   '<p><span class="font-semibold text-slate-700">Rango estándar de operación' +
                       (grupo.etiqueta ? ' (' + esc(grupo.etiqueta) + ')' : '') + ':</span> ' + esc(rangoTxt) +
                       ' <span class="text-slate-400">(' +
                       (cap ? 'capturado en la orden' : 'tabla de configuración') + ')</span></p>' +
                   (cap && grupo.etiqueta
                       ? '<p class="text-slate-400">Rango capturado del parámetro: ' + esc(textoRangoCapturado(cap)) + '</p>'
                       : '');
        }

        /* Gráfica de UN parámetro con todas sus mediciones:
             eje X          → número de medición (1, 2, 3…)
             eje Y izquierdo → valor medido/desplegado y valor programado
             eje Y derecho   → porcentaje de error de cada medición (barras)
           Las barras de error se colorean por tolerancia (rojo = fuera de
           criterio), no por el signo del error. */
        function crearGraficaParametro(canvas, grupo) {
            const pts = grupo.puntos;
            const unidad = (toleranciaParaParametro(grupo.nombre).unidad) || '';
            const labels = pts.map((p, i) => String(i + 1));
            const serieProg = pts.map(p => redondear(p.prog));
            const serieReal = pts.map(p => redondear(p.real));
            // % de error respecto al valor programado (null si el programado es 0)
            const serieErrPct = pts.map(p => (ERROR_PORCENTUAL_ABSOLUTO && p.errorPct !== null)
                                              ? Math.abs(p.errorPct) : p.errorPct);
            const coloresErr = pts.map(p => p.fuera ? 'rgba(239, 68, 68, 0.80)'
                                                    : 'rgba(0, 93, 161, 0.55)');

            const bandas = pts.map(p => {
                const m = margenTolerancia(grupo.nombre, p.prog);
                return { min: redondear(p.prog - m), max: redondear(p.prog + m) };
            });
            const rango = rangoOperacion(grupo.nombre, grupo.idxComp);

            // Escala izquierda: valores, banda de tolerancia y —si no aplasta los
            // datos— los límites del rango estándar de operación
            const valores = [].concat(serieProg, serieReal,
                                      bandas.map(b => b.min), bandas.map(b => b.max));
            let vMin = Math.min.apply(null, valores);
            let vMax = Math.max.apply(null, valores);
            const span = (vMax - vMin) || Math.max(Math.abs(vMax) * 0.2, 1);
            if (rango) {
                if (rango.min > vMin - span * 2) vMin = Math.min(vMin, rango.min);
                if (rango.max < vMax + span * 2) vMax = Math.max(vMax, rango.max);
            }
            const holgura = ((vMax - vMin) || 1) * 0.18;

            const chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Referencia (programado o medido)', data: serieProg,
                            borderColor: '#94a3b8', backgroundColor: '#94a3b8',
                            borderDash: [5, 5], borderWidth: 2,
                            fill: false, tension: 0.1, pointRadius: 3, yAxisID: 'y'
                        },
                        {
                            label: 'Lectura evaluada (medido o desplegado)', data: serieReal,
                            borderColor: COLOR_INSTITUCIONAL,
                            backgroundColor: 'rgba(0, 93, 161, 0.10)',
                            borderWidth: 2, fill: true, tension: 0.3,
                            pointRadius: 4, pointBackgroundColor: COLOR_INSTITUCIONAL, yAxisID: 'y'
                        },
                        {
                            type: 'bar', label: 'Error (%)', data: serieErrPct,
                            backgroundColor: coloresErr, borderColor: coloresErr,
                            borderWidth: 1, borderRadius: 2,
                            barPercentage: 0.5, categoryPercentage: 0.7, yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    animation: false,
                    interaction: { mode: 'index', intersect: false },
                    layout: { padding: { top: 12 } },
                    plugins: {
                        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 9 } } },
                        datalabels: { display: false },
                        bandasMedicion: { bandas: bandas, rango: rango },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            callbacks: {
                                title: (items) => 'Medición ' + items[0].label,
                                afterBody: function (items) {
                                    const p = pts[items[0].dataIndex];
                                    if (!p) return '';
                                    const u = unidad ? ' ' + unidad : '';
                                    return 'Error: ' + fmtErrorPct(p) +
                                           '  ·  absoluto ' + fmtError(p.error) + u +
                                           (p.fuera ? ' — FUERA DE TOLERANCIA' : ' — dentro de tolerancia');
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Número de medición', font: { size: 9 } },
                            ticks: { font: { size: 9 } }, grid: { display: false }
                        },
                        y: {
                            position: 'left',
                            suggestedMin: vMin - holgura,
                            suggestedMax: vMax + holgura,
                            ticks: { font: { size: 9 } },
                            title: { display: true, text: 'Valor' + (unidad ? ' (' + unidad + ')' : ''), font: { size: 9 } }
                        },
                        y1: {
                            type: 'linear', position: 'right',
                            ticks: { font: { size: 9 }, callback: (v) => v + '%' },
                            title: { display: true, text: 'Error (%)', font: { size: 9 } },
                            grid: { drawOnChartArea: false }
                        }
                    }
                },
                plugins: [pluginBandasMedicion]
            });
            chartsRutina.push(chart);
        }

        /* (Re)construye TODAS las gráficas de la sección V: UNA POR PARÁMETRO,
           con todas las mediciones de ese parámetro dentro. Solo se grafican
           parámetros COMPARABLES (con valor programado Y valor real); las
           lecturas sueltas quedan únicamente en la tabla. */
        function construirGraficasMediciones() {
            const cont = document.getElementById('rutinaGraficasContainer');
            destruirGraficasRutina();
            if (!cont) return;
            cont.innerHTML = '';

            if (!rutinaFilasActuales) { cont.style.display = 'none'; return; }

            const grupos = agruparParametrosMedicion();
            if (grupos.length === 0) { cont.style.display = 'none'; return; }

            cont.style.display = 'grid';

            grupos.forEach((g, i) => {
                const tarjeta = document.createElement('div');
                tarjeta.className = 'grafica-medicion break-inside-avoid border border-slate-200 rounded-lg bg-white shadow-sm p-3';
                tarjeta.innerHTML =
                    '<p class="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1 truncate" title="' + esc(g.titulo) + '">' +
                        esc(g.titulo) + '</p>' +
                    '<div class="lienzo-grafica"><canvas id="rutinaChart_' + i + '"></canvas></div>' +
                    '<div class="mt-2 pt-2 border-t border-dashed border-slate-200 text-xs leading-snug text-slate-600 space-y-0.5">' +
                        leyendaRangosParametro(g) +
                    '</div>';
                cont.appendChild(tarjeta);
                crearGraficaParametro(document.getElementById('rutinaChart_' + i), g);
            });
        }

        // Se conserva el nombre anterior por compatibilidad con llamadas previas
        function construirGraficaMediciones() { construirGraficasMediciones(); }

        // ¿Los datos actuales difieren del registro original?
        function hayModificacionMediciones() {
            if (rutinaFilasActuales && rutinaFilasOriginales) {
                return rutinaFilasActuales.some((f, i) => {
                    const o = rutinaFilasOriginales[i];
                    return valorCelda(f.nombre) !== valorCelda(o.nombre) ||
                           valorCelda(f.programado) !== valorCelda(o.programado) ||
                           valorCelda(f.desplegado) !== valorCelda(o.desplegado) ||
                           valorCelda(f.medido) !== valorCelda(o.medido);
                });
            }
            if (rutinaLecturasActuales && rutinaLecturasOriginales) {
                return rutinaLecturasActuales.some((v, i) => valorCelda(v) !== valorCelda(rutinaLecturasOriginales[i]));
            }
            return false;
        }

        // Muestra u oculta la nota al pie de la Sección V según haya cambios
        function actualizarNotaModificacion() {
            document.getElementById('rutinaModifNota').classList.toggle('hidden', !hayModificacionMediciones());
        }

        // Oculta la nota y limpia el motivo (al abrir una rutina nueva)
        function reiniciarNotaModificacion() {
            document.getElementById('rutinaModifNota').classList.add('hidden');
            document.getElementById('rutinaModifMotivo').innerText = '';
        }

        // Aplica el contenido de una celda editada al estado en memoria
        function aplicarEdicionCelda(celda) {
            const idx = parseInt(celda.dataset.idx, 10);
            const campo = celda.dataset.editCampo;
            const valor = valorCelda(celda.innerText);

            if (campo === 'lectura') {
                if (rutinaLecturasActuales && idx < rutinaLecturasActuales.length) {
                    rutinaLecturasActuales[idx] = valor;
                }
            } else if (rutinaFilasActuales && idx < rutinaFilasActuales.length) {
                rutinaFilasActuales[idx][campo] = valor;
                // v3.0: al editar el rango se actualiza el mapa que usan las gráficas
                if (campo === 'rango') {
                    const clave = claveParametro(rutinaFilasActuales[idx].nombre);
                    const r = parsearRangoEstandar('rango ' + valor);
                    if (r) rangosCapturados.set(clave, r); else rangosCapturados.delete(clave);
                }
                // Recalcular la columna Error de esa fila en vivo
                // v2.7: innerHTML para poder mostrar el desglose por componente
                const celdaErr = document.querySelector(`[data-err-idx="${idx}"]`);
                if (celdaErr) {
                    const err = celdaErrorFila(rutinaFilasActuales[idx]);
                    celdaErr.innerHTML = err.html;
                    celdaErr.className = err.cls;
                    celdaErr.title = err.title;
                }
            }
            actualizarNotaModificacion();
        }

        // Delegación de eventos sobre la tabla de mediciones
        (function iniciarEdicionMediciones() {
            const cont = document.getElementById('rutinaTablaContainer');

            // Al enfocar una celda vacía ('—'), limpiarla para escribir directo
            cont.addEventListener('focusin', e => {
                const c = e.target.closest('[data-edit-campo]');
                if (c && c.innerText.trim() === '—') c.innerText = '';
            });

            // Mientras se escribe: actualizar estado, error y nota
            cont.addEventListener('input', e => {
                const c = e.target.closest('[data-edit-campo]');
                if (c) aplicarEdicionCelda(c);
            });

            // Al salir de la celda: restaurar '—' si quedó vacía y redibujar gráfica
            cont.addEventListener('focusout', e => {
                const c = e.target.closest('[data-edit-campo]');
                if (!c) return;
                if (c.innerText.trim() === '') c.innerText = '—';
                aplicarEdicionCelda(c);
                // v2.7: se redibuja también la tabla para regenerar el renglón
                // de desglose si el valor pasó de simple a compuesto (o al revés)
                if (rutinaFilasActuales) { renderTablaMediciones(); construirGraficasMediciones(); }
            });

            // Evitar saltos de línea dentro de las celdas (Enter = confirmar)
            cont.addEventListener('keydown', e => {
                const c = e.target.closest('[data-edit-campo]');
                if (c && e.key === 'Enter') { e.preventDefault(); c.blur(); }
            });
        })();

        /* FIX impresión: se reemplaza el canvas por una imagen estática antes de
           imprimir (los canvas de Chart.js salen en blanco o borrosos).

           v2.8.2 — endurecido tras detectarse que las gráficas no salían:
             · Bandera anti-duplicado: antes, imprimir desde el botón y que
               además disparara 'beforeprint' insertaba DOS imágenes por canvas.
             · Si el canvas está vacío (0 px) o toDataURL devuelve una imagen
               en blanco, se DEJA el canvas visible en lugar de ocultarlo: es
               preferible una gráfica imperfecta a un hueco en el documento.
             · El tamaño se controla por CSS (.print-canvas-img), no en línea. */
        let canvasPreparadosParaImpresion = false;

        function prepararCanvasImpresion() {
            if (canvasPreparadosParaImpresion) return;
            canvasPreparadosParaImpresion = true;

            document.querySelectorAll('canvas').forEach(cv => {
                try {
                    if (!cv.width || !cv.height) return;      // canvas sin dibujar
                    const datos = cv.toDataURL('image/png', 1.0);
                    if (!datos || datos.length < 1000) return; // imagen en blanco
                    const img = document.createElement('img');
                    img.src = datos;
                    img.className = 'print-canvas-img';
                    img.alt = '';
                    cv.style.display = 'none';
                    cv.parentNode.insertBefore(img, cv);
                } catch (e) { /* canvas no exportable: se imprime tal cual */ }
            });
        }

        function restaurarCanvasImpresion() {
            document.querySelectorAll('img.print-canvas-img').forEach(img => img.remove());
            document.querySelectorAll('canvas').forEach(cv => { cv.style.display = ''; });
            canvasPreparadosParaImpresion = false;
        }

        /* Espera a que las imágenes generadas terminen de decodificarse. Sin
           esto, el diálogo de impresión puede abrirse antes de que la imagen
           esté lista y el hueco de la gráfica sale vacío. */
        function esperarImagenesImpresion() {
            const imgs = Array.from(document.querySelectorAll('img.print-canvas-img'));
            return Promise.all(imgs.map(img => (img.complete && img.naturalWidth)
                ? Promise.resolve()
                : new Promise(resolve => {
                    img.onload = img.onerror = resolve;
                    setTimeout(resolve, 1500);   // nunca bloquear la impresión
                })));
        }

        window.addEventListener('beforeprint', prepararCanvasImpresion);
        window.addEventListener('afterprint', restaurarCanvasImpresion);

        /* v2.8.2: la conversión de gráficas a imagen se hace AQUÍ y se espera a
           que carguen, en vez de confiar solo en el evento 'beforeprint'
           (que no dispara en Safari/iOS y en Chrome puede llegar demasiado
           tarde para que la imagen alcance a decodificarse). */
        async function imprimirRutina() {
            registrarEvento('imprimir_rutina', 'Folio ' + document.getElementById('rutFolio').innerText); // v2.6 bitácora
            prepararCanvasImpresion();
            await esperarImagenesImpresion();
            window.print();
            // Respaldo: algunos navegadores móviles no disparan 'afterprint'
            setTimeout(restaurarCanvasImpresion, 2000);
        }

        /* ============================================================
           TABLA DE CORRECTIVOS
           ============================================================ */
        // v2.7: debounce — antes se re-renderizaba la tabla completa en cada tecla
        const debounce = (fn, ms = 180) => {
            let t;
            return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
        };
        // v3.7: los mismos listeners para las cuatro pestañas de servicio
        Object.keys(PESTANAS_SERVICIO).forEach(clave => {
            const c = PESTANAS_SERVICIO[clave];
            const el = (base) => document.getElementById(base + c.suf);

            el('filtroTexto').addEventListener('input', debounce(() => renderTablaServicio(clave)));

            el('filtroAnio').addEventListener('change', () => {
                poblarSelectMeses('filtroMesEjec' + c.suf, c.datos(),
                                  el('filtroAnio').value, c.conProximo ? 'Todos' : 'Todos los meses');
                renderTablaServicio(clave);
            });
            el('filtroMesEjec').addEventListener('change', () => renderTablaServicio(clave));

            if (c.conProximo) el('filtroMesProx').addEventListener('change', () => renderTablaServicio(clave));

            // La rutina solo se genera desde las pestañas con próximo servicio
            el('tabla').addEventListener('click', (e) => {
                const btn = e.target.closest('button.btn-rutina');
                if (btn) { abrirRutina(btn.dataset.id); return; }

                // v3.8: el folio de factura abre la factura completa
                const fac = e.target.closest('button.btn-ver-factura');
                if (fac) { abrirFacturaExistente(fac.dataset.factura); return; }
            });

            // v3.8: selección de órdenes para facturar
            el('tabla').addEventListener('change', (e) => {
                if (e.target.classList.contains('chk-orden')) actualizarBarraFacturacion(clave);
            });

            const chkTodos = document.getElementById('content' + c.suf).querySelector('.chk-todos');
            if (chkTodos) chkTodos.addEventListener('change', () => {
                el('tabla').querySelectorAll('.chk-orden').forEach(x => { x.checked = chkTodos.checked; });
                actualizarBarraFacturacion(clave);
            });
        });
        document.getElementById('buscadorClientes').addEventListener('input', debounce((e) => generarSidebarClientes(e.target.value)));
        document.getElementById('btnSidebarToggle').addEventListener('click', toggleSidebar);
        document.getElementById('sidebarOverlay').addEventListener('click', toggleSidebar);

        /* ============================================================
           DASHBOARD GENERAL
           ============================================================ */
        const parsePercent = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const num = parseFloat(val.replace(/%/g, '').trim());
            return isNaN(num) ? 0 : num;
        };

        const formatearKPI = (valor, esPorcentaje = false) => {
            // v2.9: 2 decimales en todos los indicadores calculados
            if (esPorcentaje) return valor.toFixed(2) + '%';
            return valor.toFixed(2);
        };

        function renderizarDashboard(filtroMes) {
            let sumMTTR = 0, sumFallas = 0, sumPrev = 0, sumCorr = 0, sumEntrega = 0, sumRefac = 0;
            let kpiTotalItems = 0;

            let datosFiltradosKPI = datosAgrupadosPorMes;
            if (filtroMes !== 'todos') {
                datosFiltradosKPI = datosAgrupadosPorMes.filter(item => (item.mes || '').toLowerCase().trim() === filtroMes);
            }

            if (datosFiltradosKPI.length > 0) {
                datosFiltradosKPI.forEach(d => {
                    sumPrev += parsePercent(d.ratio_preventivo);
                    sumCorr += parsePercent(d.ratio_corectivo || d.ratio_correctivo);
                    sumMTTR += Number(d.mttr) || 0;
                    sumEntrega += parsePercent(d.tasa_entrega);
                    sumRefac += parsePercent(d.tasa_refacciones);
                    sumFallas += parsePercent(d.fallas_criticas);
                    kpiTotalItems++;
                });

                // FIX: se promedia siempre entre el número de filas sumadas
                // (antes, con filtro de mes se dividía entre 1 aunque hubiera varias filas)
                const divisorPromedio = Math.max(kpiTotalItems, 1);

                const setVal = (id, val) => { if (document.getElementById(id)) document.getElementById(id).innerText = val; };

                setVal('kpi-prev', formatearKPI(sumPrev / divisorPromedio, true));
                setVal('kpi-corr', formatearKPI(sumCorr / divisorPromedio, true));
                setVal('kpi-mttr', formatearKPI(sumMTTR / divisorPromedio, false));
                setVal('kpi-entrega', formatearKPI(sumEntrega / divisorPromedio, true));
                setVal('kpi-refacciones', formatearKPI(sumRefac / divisorPromedio, true));
                setVal('kpi-fallas', formatearKPI(sumFallas / divisorPromedio, true));

            } else {
                document.querySelectorAll('[id^="kpi-"]').forEach(el => {
                    if (!el.id.includes('ventas')) el.innerText = el.id.includes('mttr') ? '0' : '0%';
                });
            }

            // FIX: ahora el filtro por mes funciona porque Mes se deriva de la fecha
            let datosFiltradosCorpus = datosDetalleOrdenes;
            if (filtroMes !== 'todos') {
                datosFiltradosCorpus = datosDetalleOrdenes.filter(item => item.Mes === filtroMes);
            }

            const conteoVentasReales = datosFiltradosCorpus.filter(d => d.oportunidad).length;
            if (document.getElementById('kpi-ventas')) document.getElementById('kpi-ventas').innerText = conteoVentasReales;

            let cargaMap = {}, tiposMap = {}, clientesMap = {}, marcasMap = {};
            let countGarantia = 0, countContrato = 0, countFuera = 0, countPrueba = 0;

            datosFiltradosCorpus.forEach(d => {
                if (d.estatus_seguimiento_limpio) {
                    if (d.estatus_seguimiento_limpio.includes('GARANTIA')) countGarantia++;
                    if (d.estatus_seguimiento_limpio.includes('CONTRATO')) countContrato++;
                    if (d.estatus_seguimiento_limpio.includes('FUERA DE SERVICIO')) countFuera++;
                    if (d.estatus_seguimiento_limpio.includes('PRUEBA') || d.estatus_seguimiento_limpio.includes('8 DIAS')) countPrueba++;
                }

                if (d.Ingeniero && d.Ingeniero !== 'Sin Asignar') {
                    cargaMap[d.Ingeniero] = (cargaMap[d.Ingeniero] || 0) + 1;
                }

                if (d['Tipo de Servicio']) tiposMap[d['Tipo de Servicio']] = (tiposMap[d['Tipo de Servicio']] || 0) + 1;
                clientesMap[d.Cliente] = (clientesMap[d.Cliente] || 0) + 1;
                marcasMap[d.Marca] = (marcasMap[d.Marca] || 0) + 1;
            });

            if (document.getElementById('ind-garantia')) document.getElementById('ind-garantia').innerText = countGarantia;
            if (document.getElementById('ind-contrato')) document.getElementById('ind-contrato').innerText = countContrato;
            if (document.getElementById('ind-fuera')) document.getElementById('ind-fuera').innerText = countFuera;
            if (document.getElementById('ind-prueba')) document.getElementById('ind-prueba').innerText = countPrueba;

            actualizarGraficas(cargaMap, tiposMap, clientesMap, marcasMap);

            // v2.6: se guarda la lista filtrada y un único listener abre el modal
            // (antes se clonaba el nodo en cada render para reemplazar el listener)
            oportunidadesVisibles = datosFiltradosCorpus.filter(d => d.oportunidad);
        }

        let oportunidadesVisibles = [];

        function abrirModalOportunidades() {
            const tbody = document.getElementById('listaOportunidades');
            tbody.innerHTML = '';
            if (oportunidadesVisibles.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No hay oportunidades de venta detectadas.</td></tr>';
            } else {
                oportunidadesVisibles.forEach(op => {
                    const tr = document.createElement('tr');
                    tr.classList.add('hover:bg-slate-50', 'transition-colors');
                    tr.innerHTML = `
                        <td class="px-4 py-3 font-bold text-brand-600 whitespace-nowrap">${esc(op.ID)}</td>
                        <td class="px-4 py-3 text-slate-800 font-medium">${esc(op.Cliente)}</td>
                        <td class="px-4 py-3 text-slate-500">${esc(op.Equipo)}</td>
                        <td class="px-4 py-3"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold border border-slate-200">${esc(op.Ingeniero)}</span></td>
                        <td class="px-4 py-3 text-xs text-slate-500 italic whitespace-normal min-w-[250px] break-words">${esc(op.motivo_venta)}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
            document.getElementById('modalOportunidades').classList.remove('hidden');
        }

        if (document.getElementById('card-ventas')) {
            document.getElementById('card-ventas').addEventListener('click', abrirModalOportunidades);
        }

        function actualizarGraficas(carga, tipos, clientes, marcas) {
            Object.values(charts).forEach(c => { if (c) c.destroy(); });
            Chart.defaults.font.family = "'Inter', sans-serif";

            const toData = (objMap) => {
                const arr = Object.entries(objMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
                return { labels: arr.map(i => i[0]), data: arr.map(i => i[1]) };
            };

            const datosCarga = toData(carga);
            if (document.getElementById('chartCargaTrabajo')) {
                charts.carga = new Chart(document.getElementById('chartCargaTrabajo'), {
                    type: 'bar',
                    data: { labels: datosCarga.labels, datasets: [{ data: datosCarga.data, backgroundColor: COLOR_INSTITUCIONAL, borderRadius: 4 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } } }
                });
            }

            if (document.getElementById('chartTipos')) {
                charts.tipos = new Chart(document.getElementById('chartTipos'), {
                    type: 'doughnut',
                    data: { labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: palette }] },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '50%',
                        plugins: {
                            legend: { position: 'right' },
                            datalabels: {
                                color: '#ffffff', font: { weight: 'bold' },
                                formatter: (value, ctx) => {
                                    const total = ctx.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
                                    return total > 0 ? Math.round((value / total) * 100) + '%' : value;
                                }
                            }
                        }
                    }
                });
            }

            const datosCl = toData(clientes);
            if (document.getElementById('chartClientes')) {
                charts.clientes = new Chart(document.getElementById('chartClientes'), {
                    type: 'bar',
                    data: { labels: datosCl.labels, datasets: [{ data: datosCl.data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } } }
                });
            }

            const datosMc = toData(marcas);
            if (document.getElementById('chartMarcas')) {
                charts.marcas = new Chart(document.getElementById('chartMarcas'), {
                    type: 'bar',
                    data: { labels: datosMc.labels, datasets: [{ data: datosMc.data, backgroundColor: '#8b5cf6', borderRadius: 4 }] },
                    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } } }
                });
            }
        }

        if (document.getElementById('cerrarModal')) {
            document.getElementById('cerrarModal').addEventListener('click', () => {
                document.getElementById('modalOportunidades').classList.add('hidden');
            });
        }

        if (document.getElementById('monthFilter')) {
            document.getElementById('monthFilter').addEventListener('change', (e) => renderizarDashboard(e.target.value));
        }

        if (document.getElementById('btnAnual')) {
            document.getElementById('btnAnual').addEventListener('click', () => {
                document.getElementById('monthFilter').value = 'todos';
                renderizarDashboard('todos');
            });
        }

        /* ============================================================
           v2.6 — SEGURIDAD: SESIÓN, CONTROL DE ACCESO Y BITÁCORA
           ============================================================ */
        function hayBackend() { return String(URL_APPS_SCRIPT || '').trim() !== ''; }

        /* v3.2 — Identificador de este navegador. Sirve para que el bloqueo por
           intentos fallidos se cuente por equipo: sin nombre de usuario en la
           pantalla de acceso, no hay otra llave contra la cual contar. No
           identifica a la persona, solo al dispositivo. */
        function idDispositivo() {
            try {
                let id = localStorage.getItem('ia_dispositivo');
                if (!id) {
                    id = (crypto.randomUUID ? crypto.randomUUID()
                                            : 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2));
                    localStorage.setItem('ia_dispositivo', id);
                }
                return id;
            } catch (_) { return 'sin-id'; }
        }
        function gateActivo() { return !!(CONTROL_ACCESO && CONTROL_ACCESO.habilitado && (String(CONTROL_ACCESO.pin || '') !== '' || hayBackend())); }

        function sesionActual() {
            try {
                const s = JSON.parse(localStorage.getItem('ia_sesion') || 'null');
                if (!s || !s.nombre) return null;
                if (hayBackend()) {
                    // v5.3: sin sesión firmada por el servidor no hay sesión
                    // (incluye las guardadas por versiones anteriores)
                    if (!s.token || !(s.expira > Date.now())) return null;
                    return s;
                }
                const dias = (Date.now() - (s.ts || 0)) / 86400000;
                if (dias > (CONTROL_ACCESO.diasSesion || 30)) return null;
                return s;
            } catch (_) { return null; }
        }
        function tokenSesion() { const s = sesionActual(); return (s && s.token) || ''; }
        function nombreUsuario() { const s = sesionActual(); return s ? s.nombre : 'Sin identificar'; }

        // v3.1: rol de la sesión en curso ('admin' | 'usuario')
        function rolUsuario() { const s = sesionActual(); return (s && s.rol) ? s.rol : 'usuario'; }
        function esAdministrador() { return rolUsuario() === 'admin'; }

        function guardarSesion(nombre, rol, token, expira) {
            localStorage.setItem('ia_sesion', JSON.stringify({
                nombre: nombre, rol: rol || 'usuario', ts: Date.now(),
                token: token || '', expira: expira || 0
            }));
        }

        /* v5.3 — El servidor contesta { codigo: 'SESION' } cuando la sesión venció,
           se cerraron todas o al usuario se le desactivó o cambió el PIN. Se
           revisan todas las respuestas del backend en un solo lugar (sin tocar
           cada llamada) y, si pasa, se vuelve a pedir el PIN. */
        let avisoSesionMostrado = false;
        function sesionVencida() {
            if (avisoSesionMostrado) return;
            avisoSesionMostrado = true;
            try { localStorage.removeItem('ia_sesion'); } catch (_) {}
            mostrarUsuarioSidebar();
            mostrarModalAcceso();
            const err = document.getElementById('accesoError');
            if (err) {
                err.innerText = 'Tu sesión venció o ya no es válida. Vuelve a entrar con tu PIN.';
                err.classList.remove('hidden');
            }
        }
        (function vigilarSesion() {
            const original = window.fetch.bind(window);
            window.fetch = async function (recurso, opciones) {
                const r = await original(recurso, opciones);
                try {
                    const url = typeof recurso === 'string' ? recurso : (recurso && recurso.url) || '';
                    if (hayBackend() && url.indexOf(URL_APPS_SCRIPT) === 0 && r.type !== 'opaque') {
                        r.clone().text().then(t => {
                            if (t && t.charAt(0) === '{' && /"codigo"\s*:\s*"SESION"/.test(t)) sesionVencida();
                        }).catch(() => {});
                    }
                } catch (_) {}
                return r;
            };
        })();

        /* v5.3 — Al salir se borra lo que la plataforma dejó en el equipo: en
           una computadora compartida del hospital, el siguiente usuario no debe
           poder abrir la copia de las hojas. Los seguimientos que aún no se
           sincronizan se conservan (y se avisa) para no perder trabajo. */
        async function borrarDatosLocales() {
            try { sessionStorage.clear(); } catch (_) {}
            try {
                if (window.caches) {
                    const nombres = await caches.keys();
                    await Promise.all(nombres.filter(n => n.indexOf('ia-datos-') === 0).map(n => caches.delete(n)));
                }
            } catch (_) {}
            let pendientes = 0;
            try { pendientes = (typeof comCola !== 'undefined' && Array.isArray(comCola)) ? comCola.length : 0; } catch (_) {}
            if (!pendientes) { try { localStorage.removeItem(LS_COM); } catch (_) {} }
            return pendientes;
        }

        /* La credencial con la que el administrador puede dar de alta usuarios
           se guarda en sessionStorage, no en localStorage: vive mientras la
           pestaña siga abierta y desaparece al cerrarla. El servidor la vuelve
           a verificar en cada alta; aquí solo se conserva para no pedirla en
           cada movimiento. */
        /* v5.3: ya no se guarda el PIN del administrador en el navegador. El
           servidor sabe quién es administrador por la sesión firmada. Estas
           funciones se conservan vacías por compatibilidad. */
        function guardarCredencialAdmin() {}
        function credencialAdmin() { return null; }
        function olvidarCredencialAdmin() { try { sessionStorage.removeItem('ia_admin'); } catch (_) {} }

        function mostrarUsuarioSidebar() {
            const f = document.getElementById('sidebarFooter');
            const s = sesionActual();
            if (s && gateActivo()) {
                f.classList.remove('hidden');
                const u = document.getElementById('sidebarUsuario');
                u.innerText = s.nombre; u.title = s.nombre + ' · ' + (s.rol === 'admin' ? 'Administrador' : 'Usuario');
                const badge = document.getElementById('sidebarRol');
                if (badge) {
                    badge.innerText = s.rol === 'admin' ? 'ADMINISTRADOR' : 'USUARIO';
                    badge.className = 'text-xs font-bold tracking-wider px-1.5 py-0.5 rounded ' +
                        (s.rol === 'admin' ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-700 text-slate-400');
                }
                aplicarPermisosInterfaz();
            } else {
                f.classList.add('hidden');
            }
        }

        // Envía un evento a la bitácora del backend (fire-and-forget).
        // Sin backend configurado solo queda constancia en la consola.
        function registrarEvento(tipo, detalle = '', extra = {}) {
            const payload = Object.assign({
                accion: 'log', token: tokenSesion(),
                tipo: tipo, detalle: detalle,
                usuario: nombreUsuario(),
                cliente: clienteActual || '',
                fecha: new Date().toISOString(),
                url: location.href,
                referencia: document.referrer || '',
                userAgent: navigator.userAgent,
                plataforma: navigator.platform || '',
                pantalla: (screen && screen.width ? screen.width + 'x' + screen.height : ''),
                zonaHoraria: (Intl.DateTimeFormat().resolvedOptions().timeZone || '')
            }, extra);

            if (!hayBackend()) { console.info('[Bitácora local]', payload); return; }
            try {
                const cuerpo = JSON.stringify(payload);
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(URL_APPS_SCRIPT, new Blob([cuerpo], { type: 'text/plain;charset=utf-8' }));
                } else {
                    fetch(URL_APPS_SCRIPT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: cuerpo });
                }
            } catch (_) { /* nunca bloquear la app por la bitácora */ }
        }

        // Registrar la primera visita a cada cliente por sesión (sin spam)
        const clientesVistosSesion = new Set();
        function registrarVistaCliente(nombre) {
            if (clientesVistosSesion.has(nombre)) return;
            clientesVistosSesion.add(nombre);
            registrarEvento('ver_cliente', nombre);
        }

        let intentosPinFallidos = 0;
        function mostrarModalAcceso() {
            const m = document.getElementById('modalAcceso');
            m.classList.remove('hidden'); m.classList.add('flex');
            // v3.2: solo se pide el PIN; también acepta el código maestro
            const pinInput = document.getElementById('accesoPin');
            pinInput.classList.remove('hidden');
            pinInput.required = true;
            setTimeout(() => document.getElementById('accesoPin').focus(), 60);
        }

        document.getElementById('formAcceso').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pinIngresado = document.getElementById('accesoPin').value.trim();
            const errorEl = document.getElementById('accesoError');
            const btn = e.target.querySelector('button[type="submit"]');

            if (!pinIngresado) {
                errorEl.innerText = 'Escribe tu PIN para continuar.';
                errorEl.classList.remove('hidden');
                return;
            }

            btn.disabled = true; btn.innerText = 'Validando…';
            try {
                /* v3.2: el PIN es la identidad. Se manda solo el PIN y el
                   servidor responde con el nombre y el rol de quien lo tiene.
                   El navegador nunca recibe la lista de PIN, así que no hay
                   nada que leer desde la consola. */
                let res;
                if (hayBackend()) {
                    const r = await fetch(URL_APPS_SCRIPT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            accion: 'login', token: tokenSesion(),
                            pin: pinIngresado,
                            dispositivo: idDispositivo(),
                            fecha: new Date().toISOString()
                        })
                    });
                    res = await r.json().catch(() => null);
                    if (!res) throw new Error('No se pudo contactar al servidor de acceso. Revisa tu conexión.');
                } else {
                    res = await validarAccesoLocal(pinIngresado);
                }

                if (!res.ok) {
                    intentosPinFallidos++;
                    errorEl.innerText = res.error || 'PIN incorrecto.';
                    errorEl.classList.remove('hidden');
                    document.getElementById('accesoPin').value = '';
                    document.getElementById('accesoPin').focus();
                    if (!hayBackend()) registrarEvento('intento_pin_fallido', 'Intento ' + intentosPinFallidos);
                    return;
                }

                guardarSesion(res.nombre, res.rol || 'usuario', res.token, res.expira);
                olvidarCredencialAdmin();
                avisoSesionMostrado = false;

                errorEl.classList.add('hidden');
                document.getElementById('accesoPin').value = '';
                const m = document.getElementById('modalAcceso');
                m.classList.add('hidden'); m.classList.remove('flex');
                mostrarUsuarioSidebar();
                aplicarPermisosInterfaz();
                if (!hayBackend()) registrarEvento('acceso', 'Ingreso local como ' + (res.rol || 'usuario'));
                cargarDatos();
                // v5.3: los PIN de menos de 6 caracteres se piden cambiar al entrar
                if (res.pinCorto) {
                    setTimeout(() => {
                        abrirCambiarPin();
                        mensajePinUI('Tu PIN tiene menos de 6 caracteres. Por seguridad, cámbialo ahora por uno de 6 o más.', 'info');
                    }, 400);
                }
            } catch (err) {
                errorEl.innerText = err.message;
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false; btn.innerText = 'Entrar al panel';
            }
        });

        document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
            registrarEvento('cierre_sesion');
            const pendientes = await borrarDatosLocales();
            if (pendientes) {
                await avisar('Quedan ' + pendientes + ' cambio(s) de seguimiento sin sincronizar. Se conservaron en este equipo ' +
                      'y se enviarán la próxima vez que alguien entre con conexión.');
            }
            localStorage.removeItem('ia_sesion');
            olvidarCredencialAdmin();
            location.reload();
        });

        /* ============================================================
           v3.1 — ADMINISTRACIÓN DE USUARIOS

           Importante sobre el alcance: esconder este apartado a quien no es
           administrador es comodidad, no seguridad. Quien sepa manipular la
           página puede hacerlo visible. Lo que realmente protege el alta de
           usuarios es que Apps Script vuelve a verificar la credencial de
           administrador en CADA operación y rechaza las que no la traigan.
           Sin backend configurado no hay tal verificación: el modo local
           sirve para probar, no para operar de verdad.
           ============================================================ */

        // Muestra u oculta lo que corresponde al rol de la sesión
        function aplicarPermisosInterfaz() {
            const btn = document.getElementById('btnAdminUsuarios');
            if (!btn) return;
            const admin = esAdministrador();
            btn.classList.toggle('hidden', !admin);

            // v4.1: la auditoría financiera también es solo del administrador
            const btnAud = document.getElementById('btnAuditoria');
            if (btnAud) btnAud.classList.toggle('hidden', !admin);
            const btnCat = document.getElementById('btnCatalogos');     // v4.9
            if (btnCat) btnCat.classList.toggle('hidden', !admin);

            if (!admin) {
                document.getElementById('adminUsuariosContent').classList.add('hidden');
                document.getElementById('auditoriaContent').classList.add('hidden');
                document.getElementById('catalogosContent').classList.add('hidden');
            }
        }

        function mensajeUsuariosUI(texto, tipo) {
            const p = document.getElementById('usuMensaje');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-700 border border-green-200',
                info:  'bg-slate-100 text-slate-600 border border-slate-200'
            };
            p.className = 'text-xs rounded-lg p-3 mt-3 ' + (estilos[tipo] || estilos.info);
            p.innerText = texto;
            p.classList.toggle('hidden', !texto);
        }

        async function mostrarAdminUsuarios() {
            if (!esAdministrador()) {
                avisar('Este apartado es exclusivo del administrador.');
                return;
            }
            // v4.2: si la credencial no está o no sirve, el apartado no se abre
            if (!(await asegurarCredencialAdmin())) return;
            resetSidebarStyles();
            document.getElementById('btnAdminUsuarios').classList.add('border-l-4', 'border-brand-500', 'bg-slate-800/50', 'text-white');
            document.getElementById('btnAdminUsuarios').classList.remove('text-slate-400');
            document.getElementById('dashboardContent').style.display = 'none';
            document.getElementById('clienteContent').style.display = 'none';
            document.getElementById('auditoriaContent').classList.add('hidden');
            document.getElementById('cotizadorContent').classList.add('hidden');
            document.getElementById('catalogosContent').classList.add('hidden');
            document.getElementById('adminUsuariosContent').classList.remove('hidden');
            cerrarSidebarMovil();
            registrarEvento('ver_usuarios');
            cargarListaUsuarios();
            renderTarifario();
        }

        /* v4.2 — Pide la credencial y LA COMPRUEBA contra el servidor antes de
           seguir. Antes se guardaba lo que se escribiera y el apartado se abría
           igual: el rechazo llegaba después, al intentar leer la lista, así que
           parecía que cualquier código servía para entrar.

           Devuelve true si quedó una credencial válida en la sesión. */
        /* v5.3 — El permiso de administrador viaja en la sesión firmada, así que
           ya no se pide un código aparte ni se guarda en el navegador. El
           servidor vuelve a comprobar el rol en cada operación. */
        async function asegurarCredencialAdmin() {
            if (!hayBackend()) return true;
            if (esAdministrador()) return true;
            avisar('Este apartado es solo para administradores.');
            return false;
        }

        /* Llamada al backend para operaciones de administrador. */
        async function peticionAdmin(accion, extra) {
            const cuerpo = Object.assign({ accion: accion, token: tokenSesion() }, extra || {});
            const r = await fetch(URL_APPS_SCRIPT, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(cuerpo)
            });
            const j = await r.json().catch(() => null);
            if (!j) throw new Error('El servidor respondió de forma inesperada.');
            if (!j.ok) throw new Error(j.error || 'No se pudo completar la operación.');
            return j;
        }

        function renderListaUsuarios(usuarios) {
            const cont = document.getElementById('listaUsuarios');
            if (!usuarios || usuarios.length === 0) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic p-6">Todavía no hay usuarios dados de alta. ' +
                                 'Mientras no exista ninguno, se sigue aceptando el PIN compartido de la configuración.</p>';
                return;
            }
            const th = 'px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider';
            const td = 'px-4 py-3 text-sm text-slate-700';
            cont.innerHTML =
                '<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50"><tr>' +
                    '<th class="' + th + '">Nombre</th>' +
                    '<th class="' + th + '">Rol</th>' +
                    '<th class="' + th + '">Estado</th>' +
                    '<th class="' + th + '">Alta</th>' +
                    '<th class="' + th + '">Último acceso</th>' +
                    '<th class="' + th + ' text-right">Acciones</th>' +
                '</tr></thead><tbody class="divide-y divide-slate-100 bg-white">' +
                usuarios.map(u =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="' + td + ' font-semibold text-slate-900">' + esc(u.nombre) + '</td>' +
                        '<td class="' + td + '">' + (u.rol === 'admin'
                            ? '<span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">ADMINISTRADOR</span>'
                            : '<span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">USUARIO</span>') + '</td>' +
                        '<td class="' + td + '">' + (u.activo
                            ? '<span class="text-green-700 font-semibold">Activo</span>'
                            : '<span class="text-slate-400">Inactivo</span>') + '</td>' +
                        '<td class="' + td + ' text-xs text-slate-500">' + esc(fechaCorta(u.creado)) + '</td>' +
                        '<td class="' + td + ' text-xs text-slate-500">' + esc(fechaCorta(u.ultimoAcceso) || 'Nunca') + '</td>' +
                        '<td class="' + td + ' text-right whitespace-nowrap">' +
                            '<button data-usu-accion="editar" data-usu="' + esc(u.nombre) + '" data-rol="' + esc(u.rol) + '" ' +
                                'class="text-xs font-semibold text-brand-600 hover:text-brand-800 px-2">Editar</button>' +
                            '<button data-usu-accion="' + (u.activo ? 'desactivar' : 'activar') + '" data-usu="' + esc(u.nombre) + '" ' +
                                'class="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2">' +
                                (u.activo ? 'Desactivar' : 'Activar') + '</button>' +
                            '<button data-usu-accion="eliminar" data-usu="' + esc(u.nombre) + '" ' +
                                'class="text-xs font-semibold text-red-500 hover:text-red-700 px-2">Eliminar</button>' +
                        '</td>' +
                    '</tr>').join('') +
                '</tbody></table>';
        }

        const fechaCorta = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            return isNaN(d) ? String(iso) : d.toLocaleDateString('es-MX');
        };

        /* v3.8: el tarifario se captura en Sheets, pero conviene verlo desde
           aquí tal como quedó LEÍDO, y sobre todo saber qué equipos del
           historial no tienen tarifa: son los que saldrían sin precio en la
           exportación valorizada. */
        /* v4.2 — El tarifario se captura en Sheets; aquí basta el resumen.
           Antes se imprimía la tabla completa y ocupaba toda la pantalla,
           empujando la lista de usuarios fuera de la vista. Ahora salen tres
           cifras y la lista de equipos sin tarifa, que es lo accionable; el
           detalle queda detrás de "Ver detalle" para quien lo necesite. */
        let tarifarioExpandido = false;

        function renderTarifario() {
            const cont = document.getElementById('vistaTarifario');
            if (!cont) return;

            if (!catalogoPrecios.length) {
                cont.innerHTML = '<p class="text-sm text-slate-500 italic p-6">No se leyó ningún renglón del tarifario. ' +
                    'Crea la pestaña con <span class="font-mono">crearHojasTarifarioYFacturacion()</span> en Apps Script y captura las tarifas.</p>';
                return;
            }

            // Solo cuentan los equipos de servicios con tarifario
            const equipos = [...new Set(datosDetalleOrdenes
                .filter(d => tipoConTarifario(d['Tipo de Servicio']))
                .map(d => d.Equipo).filter(Boolean))];
            const sinTarifa = equipos.filter(e => !tarifaDeEquipo(e));
            const conTarifa = equipos.length - sinTarifa.length;

            const cifra = (valor, etiqueta, color) =>
                '<div class="text-center px-4">' +
                    '<p class="text-2xl font-bold ' + (color || 'text-slate-900') + '">' + valor + '</p>' +
                    '<p class="text-xs uppercase tracking-wide text-slate-500 mt-0.5">' + etiqueta + '</p>' +
                '</div>';

            const th = 'px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider';
            const td = 'px-4 py-2 text-sm text-slate-700';

            const detalle = !tarifarioExpandido ? '' :
                '<div class="border-t border-slate-200 overflow-x-auto max-h-72 overflow-y-auto">' +
                '<table class="min-w-full divide-y divide-slate-200"><thead class="bg-slate-50 sticky top-0"><tr>' +
                    '<th class="' + th + '">Servicio</th><th class="' + th + '">Tipo de equipo</th>' +
                    '<th class="' + th + ' text-right">Nivel I</th><th class="' + th + ' text-right">Nivel II</th>' +
                    '<th class="' + th + ' text-right">Nivel III</th>' +
                '</tr></thead><tbody class="divide-y divide-slate-100 bg-white">' +
                catalogoPrecios.map(t =>
                    '<tr class="hover:bg-slate-50">' +
                        '<td class="' + td + ' text-xs text-slate-500">' + esc(t.servicio) + '</td>' +
                        '<td class="' + td + ' font-semibold text-slate-900">' + esc(t.equipo) + '</td>' +
                        '<td class="' + td + ' text-right font-mono">' + fmtMoneda(t.precios.I, t.moneda) + '</td>' +
                        '<td class="' + td + ' text-right font-mono">' + fmtMoneda(t.precios.II, t.moneda) + '</td>' +
                        '<td class="' + td + ' text-right font-mono">' + fmtMoneda(t.precios.III, t.moneda) + '</td>' +
                    '</tr>').join('') +
                '</tbody></table></div>';

            // v4.8: la hoja ahora también trae conceptos del cotizador
            const tarifasMant = catalogoPrecios.filter(t => tipoConTarifario(t.servicio)).length;
            const conceptos = catalogoPrecios.length - tarifasMant;

            cont.innerHTML =
                '<div class="flex flex-wrap items-center justify-between gap-4 px-6 py-4">' +
                    '<div class="flex items-center gap-2 divide-x divide-slate-200">' +
                        cifra(tarifasMant, 'tarifas de mantenimiento') +
                        cifra(conceptos, 'conceptos del cotizador', 'text-brand-600') +
                        cifra(conTarifa, 'equipos con tarifa', 'text-green-700') +
                        cifra(sinTarifa.length, 'sin tarifa', sinTarifa.length ? 'text-amber-600' : 'text-slate-900') +
                    '</div>' +
                    '<button onclick="alternarTarifario()" class="text-xs font-semibold text-brand-600 hover:text-brand-800">' +
                        (tarifarioExpandido ? 'Ocultar detalle' : 'Ver detalle') + '</button>' +
                '</div>' +
                (sinTarifa.length
                    ? '<div class="px-6 py-3 bg-amber-50 border-t border-amber-200">' +
                          '<p class="text-xs text-amber-800 leading-snug"><span class="font-bold">Sin tarifa:</span> ' +
                          esc(sinTarifa.slice(0, 10).join(' · ')) + (sinTarifa.length > 10 ? ' y ' + (sinTarifa.length - 10) + ' más' : '') +
                          '. Basta capturar el tipo genérico en la hoja.</p>' +
                      '</div>'
                    : '') +
                detalle;
        }

        function alternarTarifario() {
            tarifarioExpandido = !tarifarioExpandido;
            renderTarifario();
        }

        async function cargarListaUsuarios() {
            const cont = document.getElementById('listaUsuarios');
            if (!hayBackend()) {
                renderListaUsuarios(usuariosLocales());
                mensajeUsuariosUI('Modo local: los usuarios se guardan solo en este navegador. Configura URL_APPS_SCRIPT para que el alta sea real y compartida.', 'info');
                return;
            }
            cont.innerHTML = '<p class="text-sm text-slate-500 italic p-6">Consultando usuarios…</p>';
            try {
                const j = await peticionAdmin('listarUsuarios', {});
                renderListaUsuarios(j.usuarios || []);
            } catch (err) {
                cont.innerHTML = '<p class="text-sm text-red-600 p-6">' + esc(err.message) + '</p>';
            }
        }

        /* v3.6: cuál usuario se está editando. Vacío = se va a dar de alta uno
           nuevo. Se guarda el nombre ORIGINAL porque el administrador puede
           cambiárselo, y el servidor necesita saber qué renglón tocar. */
        let usuarioEnEdicion = '';

        function entrarModoEdicion(nombre, rol) {
            usuarioEnEdicion = nombre;
            document.getElementById('usuNombre').value = nombre;
            document.getElementById('usuPin').value = '';
            document.getElementById('usuRol').value = (rol === 'admin') ? 'admin' : 'usuario';
            document.getElementById('tituloFormUsuario').innerText = 'Editar usuario';
            document.getElementById('btnGuardarUsuario').innerText = 'Guardar cambios';
            document.getElementById('btnCancelarEdicion').classList.remove('hidden');
            const aviso = document.getElementById('avisoEdicionUsuario');
            aviso.innerText = 'Editando a "' + nombre + '". Puedes cambiarle el nombre o el rol. ' +
                              'Si dejas el PIN vacío conserva el que ya tenía; si escribes uno nuevo, el anterior deja de servir de inmediato.';
            aviso.classList.remove('hidden');
            mensajeUsuariosUI('', 'info');
            document.getElementById('usuNombre').focus();
            document.getElementById('usuNombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function salirModoEdicion() {
            usuarioEnEdicion = '';
            document.getElementById('usuNombre').value = '';
            document.getElementById('usuPin').value = '';
            document.getElementById('usuRol').value = 'usuario';
            document.getElementById('tituloFormUsuario').innerText = 'Dar de alta un usuario';
            document.getElementById('btnGuardarUsuario').innerText = 'Guardar usuario';
            document.getElementById('btnCancelarEdicion').classList.add('hidden');
            document.getElementById('avisoEdicionUsuario').classList.add('hidden');
        }

        async function guardarUsuarioDesdeFormulario() {
            const nombre = document.getElementById('usuNombre').value.trim();
            const pin = document.getElementById('usuPin').value;
            const rol = document.getElementById('usuRol').value;

            if (nombre.length < 3) { mensajeUsuariosUI('El nombre debe tener al menos 3 caracteres.', 'error'); return; }
            if (!usuarioEnEdicion && !pin) { mensajeUsuariosUI('Captura un PIN para el usuario nuevo.', 'error'); return; }
            if (pin && pin.length < 6) { mensajeUsuariosUI('El PIN debe tener al menos 6 caracteres.', 'error'); return; }

            const btn = document.getElementById('btnGuardarUsuario');
            btn.disabled = true; btn.innerText = 'Guardando…';
            try {
                if (!hayBackend()) {
                    await guardarUsuarioLocal(nombre, pin, rol, usuarioEnEdicion);
                    mensajeUsuariosUI('Usuario guardado solo en este navegador.', 'ok');
                } else {
                    const j = await peticionAdmin('guardarUsuario', {
                        usuario: {
                            nombre: nombre, nombreOriginal: usuarioEnEdicion,
                            pin: pin, rol: rol, activo: true
                        }
                    });
                    mensajeUsuariosUI(j.creado ? ('Usuario "' + nombre + '" dado de alta.')
                                               : ('Usuario "' + nombre + '" actualizado.'), 'ok');
                }
                salirModoEdicion();
                cargarListaUsuarios();
            } catch (err) {
                mensajeUsuariosUI(err.message, 'error');
            } finally {
                btn.disabled = false; btn.innerText = 'Guardar usuario';
            }
        }

        document.getElementById('btnGuardarUsuario').addEventListener('click', guardarUsuarioDesdeFormulario);
        document.getElementById('btnCancelarEdicion').addEventListener('click', salirModoEdicion);
        document.getElementById('btnRecargarUsuarios').addEventListener('click', cargarListaUsuarios);

        document.getElementById('listaUsuarios').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-usu-accion]');
            if (!btn) return;
            const nombre = btn.dataset.usu;
            const accion = btn.dataset.usuAccion;

            if (accion === 'editar') { entrarModoEdicion(nombre, btn.dataset.rol); return; }

            try {
                if (accion === 'eliminar') {
                    if (!(await confirmar('¿Eliminar a "' + nombre + '"? Dejará de tener acceso de inmediato.', { titulo: 'Eliminar usuario', textoSi: 'Eliminar', peligro: true }))) return;
                    if (!hayBackend()) { eliminarUsuarioLocal(nombre); }
                    else { await peticionAdmin('eliminarUsuario', { nombre: nombre }); }
                    mensajeUsuariosUI('Usuario "' + nombre + '" eliminado.', 'ok');
                } else {
                    const activo = (accion === 'activar');
                    if (!hayBackend()) { activarUsuarioLocal(nombre, activo); }
                    else {
                        await peticionAdmin('guardarUsuario', {
                            usuario: { nombre: nombre, pin: '', rol: '', activo: activo }
                        });
                    }
                    mensajeUsuariosUI('Usuario "' + nombre + '" ' + (activo ? 'activado' : 'desactivado') + '.', 'ok');
                }
                cargarListaUsuarios();
            } catch (err) {
                mensajeUsuariosUI(err.message, 'error');
            }
        });

        /* ---------- Modo local (sin backend) ----------
           Solo para pruebas o para un equipo suelto. El PIN se guarda como
           huella SHA-256 cuando el navegador lo permite, pero cualquiera con
           acceso a este equipo puede editar el almacenamiento local. */
        const LS_USUARIOS = 'ia_usuarios_v1';

        function usuariosLocales() {
            try { return JSON.parse(localStorage.getItem(LS_USUARIOS) || '[]'); } catch (_) { return []; }
        }
        function escribirUsuariosLocales(lista) {
            localStorage.setItem(LS_USUARIOS, JSON.stringify(lista));
        }
        async function huellaLocal(pin) {
            try {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ia-local:' + pin));
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (_) { return 'plano:' + pin; }
        }
        async function guardarUsuarioLocal(nombre, pin, rol, nombreOriginal) {
            const lista = usuariosLocales();
            const buscado = (nombreOriginal || nombre).toLowerCase();
            const i = lista.findIndex(u => u.nombre.toLowerCase() === buscado);
            if (pin) {
                const h = await huellaLocal(pin);
                if (lista.some((u, k) => k !== i && u.huella === h)) {
                    throw new Error('Ese PIN ya lo tiene otro usuario. Como el acceso es solo por PIN, cada persona necesita uno distinto.');
                }
            }
            const huella = pin ? await huellaLocal(pin) : (i >= 0 ? lista[i].huella : '');
            if (!huella) throw new Error('Captura un PIN para el usuario nuevo.');
            const reg = { nombre: nombre, huella: huella, rol: rol || 'usuario', activo: true,
                          creado: (i >= 0 ? lista[i].creado : new Date().toISOString()),
                          creadoPor: nombreUsuario(), ultimoAcceso: (i >= 0 ? lista[i].ultimoAcceso : '') };
            if (i >= 0) lista[i] = reg; else lista.push(reg);
            escribirUsuariosLocales(lista);
        }
        function eliminarUsuarioLocal(nombre) {
            escribirUsuariosLocales(usuariosLocales().filter(u => u.nombre.toLowerCase() !== nombre.toLowerCase()));
        }
        function activarUsuarioLocal(nombre, activo) {
            const lista = usuariosLocales();
            const u = lista.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
            if (u) { u.activo = activo; escribirUsuariosLocales(lista); }
        }
        // v3.2: en modo local el PIN también identifica; el nombre sale del registro
        async function validarAccesoLocal(pin) {
            if (pin === CONTROL_ACCESO.codigoAdminLocal && String(CONTROL_ACCESO.codigoAdminLocal || '').length >= 6) {
                return { ok: true, nombre: CONTROL_ACCESO.nombreAdmin || 'Administrador', rol: 'admin' };
            }
            const lista = usuariosLocales();
            if (lista.length) {
                const h = await huellaLocal(pin);
                const u = lista.find(x => x.activo && x.huella === h);
                if (u) {
                    u.ultimoAcceso = new Date().toISOString();
                    escribirUsuariosLocales(lista);
                    return { ok: true, nombre: u.nombre, rol: u.rol };
                }
                return { ok: false, error: 'PIN incorrecto.' };
            }
            // Sin usuarios dados de alta: se acepta el PIN compartido heredado
            const pinCfg = String(CONTROL_ACCESO.pin || '');
            if (pinCfg === '' || pin === pinCfg) return { ok: true, nombre: 'Sin identificar', rol: 'usuario' };
            return { ok: false, error: 'PIN incorrecto. El intento quedó registrado en la bitácora.' };
        }

        /* ============================================================
           v2.6 — COMUNICACIÓN Y SEGUIMIENTO POR CLIENTE
           Canales de contacto + bitácora de pendientes.
           Persistencia: localStorage siempre; si hay backend de Apps
           Script, los registros se sincronizan entre dispositivos
           mediante una cola de cambios con reintentos.
           ============================================================ */
        const LS_COM = 'ia_comseg_v1';
        let comData = { canales: [], seguimientos: [] };
        let comCola = [];
        let comSincronizando = false;
        let comProcesandoCola = false;
        let comUltimaSync = null;

        function cargarComLocal() {
            try {
                const d = JSON.parse(localStorage.getItem(LS_COM) || 'null');
                if (d) {
                    comData.canales = Array.isArray(d.canales) ? d.canales : [];
                    comData.seguimientos = Array.isArray(d.seguimientos) ? d.seguimientos : [];
                    comCola = Array.isArray(d.cola) ? d.cola : [];
                }
            } catch (_) { /* almacenamiento corrupto: se parte de cero */ }
        }
        function guardarComLocal() {
            try {
                localStorage.setItem(LS_COM, JSON.stringify({ canales: comData.canales, seguimientos: comData.seguimientos, cola: comCola }));
            } catch (_) { /* cuota llena: se conserva lo que está en memoria */ }
        }

        const uid = () => 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
        const ahoraISO = () => new Date().toISOString();
        const soloDigitos = (v) => String(v || '').replace(/[^\d]/g, '');

        function fmtFechaCorta(iso) {
            const d = new Date(iso);
            if (isNaN(d)) return '';
            return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) +
                   ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }

        // ---- WhatsApp: números MX de 10 dígitos reciben la lada 52 ----
        function normalizarWhatsApp(v) {
            let d = soloDigitos(v);
            if (d.length === 10) d = '52' + d;
            return d;
        }
        function urlWhatsApp(numero, texto) {
            const t = encodeURIComponent(texto || '');
            return numero ? ('https://wa.me/' + numero + '?text=' + t) : ('https://wa.me/?text=' + t);
        }
        function mensajeWhatsAppCanal(c) {
            const yo = nombreUsuario();
            return 'Hola' + (c.nombre ? ' ' + c.nombre : '') + ', le saluda ' +
                (yo !== 'Sin identificar' ? yo + ' de ' : '') +
                'Ingenieros Asociados. Le escribimos para dar seguimiento a los servicios de mantenimiento en ' + clienteActual + '.';
        }
        function mensajeWhatsAppSeguimiento(s) {
            const ult = (s.historial && s.historial.length) ? s.historial[s.historial.length - 1] : null;
            const lineas = [
                '*Ingenieros Asociados* · Seguimiento de servicio',
                'Unidad: ' + s.cliente,
                s.ordenId ? ('Orden: #' + s.ordenId + (s.ordenResumen ? ' — ' + s.ordenResumen : '')) : null,
                'Asunto: ' + s.titulo,
                'Estatus: ' + s.estatus,
                '',
                (ult && ult.nota) ? ult.nota : (s.descripcion || ''),
                '',
                'Quedamos atentos a sus comentarios. Saludos.'
            ].filter(l => l !== null);
            return lineas.join('\n');
        }

        // ---- Sincronización con Apps Script ----
        function encolarCom(tipo, registro) {
            comCola.push({ tipo: tipo, registro: JSON.parse(JSON.stringify(registro)) });
        }

        async function sincronizarComRemoto() {
            actualizarEstadoSync();
            if (!hayBackend()) return;
            comSincronizando = true; actualizarEstadoSync();
            try {
                const r = await fetch(URL_APPS_SCRIPT + '?accion=seguimiento&token=' + encodeURIComponent(tokenSesion()) + '&t=' + Date.now());
                const j = await r.json();
                if (j && j.ok) {
                    fusionarComRemoto('canales', j.canales || []);
                    fusionarComRemoto('seguimientos', j.seguimientos || []);
                    guardarComLocal();
                    comUltimaSync = new Date();
                    if (clienteActual) renderComunicacion();
                }
            } catch (err) {
                console.warn('Sincronización de seguimiento no disponible:', err);
            }
            comSincronizando = false; actualizarEstadoSync();
            procesarColaCom();
        }

        /* v5.4 — Fusión de dos versiones del mismo seguimiento: el historial es
           la unión de ambos (ningún avance se pierde), el resto de los campos
           sale de la versión más reciente y el estatus es el del último avance.
           Es la misma regla que aplica el servidor (fusionarSeguimiento en
           Code.gs). */
        const llaveAvance = (a) => a.id ? String(a.id) : [a.fecha, a.autor, a.nota].join('|');
        function fusionarSeguimiento(a, b) {
            const nuevo = String(b.actualizado || '') >= String(a.actualizado || '') ? b : a;
            const viejo = nuevo === a ? b : a;
            const mapa = {};
            (viejo.historial || []).concat(nuevo.historial || []).forEach(x => { if (x) mapa[llaveAvance(x)] = x; });
            const historial = Object.values(mapa).sort((x, y) => String(x.fecha || '').localeCompare(String(y.fecha || '')));
            const r = JSON.parse(JSON.stringify(nuevo));
            r.historial = historial;
            if (historial.length && historial[historial.length - 1].estatus) r.estatus = historial[historial.length - 1].estatus;
            r.actualizado = String(nuevo.actualizado || '') > String(viejo.actualizado || '') ? nuevo.actualizado : viejo.actualizado;
            return r;
        }

        // Canales: última-escritura-gana por "actualizado". Seguimientos: fusión
        // (v5.4). Los eliminados se conservan como lápidas (tombstones) para
        // que el borrado también viaje.
        function fusionarComRemoto(clave, remotos) {
            const map = {};
            (comData[clave] || []).forEach(r => { if (r && r.id) map[r.id] = r; });
            remotos.forEach(rem => {
                let obj = null;
                try { obj = (typeof rem.json === 'string' && rem.json) ? JSON.parse(rem.json) : rem.json; } catch (_) {}
                if (!obj || !obj.id) return;
                if (rem.eliminado === true) obj.eliminado = true;
                const loc = map[obj.id];
                if (!loc) map[obj.id] = obj;
                else if (clave === 'seguimientos') map[obj.id] = fusionarSeguimiento(loc, obj);
                else if (String(obj.actualizado || '') > String(loc.actualizado || '')) map[obj.id] = obj;
            });
            comData[clave] = Object.values(map);
        }

        async function procesarColaCom() {
            if (!hayBackend() || comSincronizando) { actualizarEstadoSync(); return; }
            if (comProcesandoCola) return;
            comProcesandoCola = true;
            while (comCola.length) {
                const op = comCola[0];
                try {
                    const r = await fetch(URL_APPS_SCRIPT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ accion: 'guardar', token: tokenSesion(), tipo: op.tipo, registro: op.registro })
                    });
                    const j = await r.json().catch(() => null);
                    if (!j || !j.ok) throw new Error((j && j.error) || 'Respuesta inválida del servidor');
                    comCola.shift();
                    // v5.4: el servidor devuelve el seguimiento ya fusionado con
                    // lo que otros hayan escrito; se trae de inmediato
                    if (op.tipo === 'seguimiento' && j.registro && j.registro.id) {
                        fusionarComRemoto('seguimientos', [{ json: j.registro, eliminado: j.registro.eliminado === true }]);
                        if (clienteActual) renderComunicacion();
                    }
                    guardarComLocal();
                } catch (err) {
                    console.warn('Cambio pendiente de sincronizar:', err);
                    break;
                }
            }
            comProcesandoCola = false;
            actualizarEstadoSync();
        }

        function actualizarEstadoSync() {
            const dot = document.getElementById('comSyncDot');
            const txt = document.getElementById('comSyncTexto');
            const btn = document.getElementById('comSyncEstado');
            if (!dot || !txt) return;
            const base = 'w-2 h-2 rounded-full inline-block ';
            if (comSincronizando) {
                dot.className = base + 'bg-amber-400 animate-pulse';
                txt.innerText = 'Sincronizando…';
                btn.title = 'Sincronizando con el servidor';
            } else if (!hayBackend()) {
                dot.className = base + 'bg-slate-300';
                txt.innerText = 'Guardado en este equipo';
                btn.title = 'Sin backend configurado: los registros viven solo en este navegador. Configura URL_APPS_SCRIPT para compartirlos.';
            } else if (comCola.length > 0) {
                dot.className = base + 'bg-amber-500';
                txt.innerText = comCola.length + ' cambio(s) por enviar';
                btn.title = 'Hay cambios guardados localmente pendientes de subir. Clic para reintentar.';
            } else {
                dot.className = base + 'bg-green-500';
                txt.innerText = 'Sincronizado' + (comUltimaSync ? ' · ' + comUltimaSync.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
                btn.title = 'Los canales y seguimientos están sincronizados con Google Sheets.';
            }
        }

        // ---- Utilerías de render ----
        const chip = (txt, cls) => '<span class="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ' + cls + '">' + esc(txt) + '</span>';
        const canalesDelCliente = () => comData.canales.filter(c => c.cliente === clienteActual && !c.eliminado);
        const seguimientosDelCliente = () => comData.seguimientos.filter(s => s.cliente === clienteActual && !s.eliminado);

        function actualizarBadgeCom() {
            const badge = document.getElementById('comBadge');
            if (!badge) return;
            const abiertos = clienteActual ? seguimientosDelCliente().filter(s => s.estatus !== 'Concluido').length : 0;
            badge.innerText = abiertos;
            badge.classList.toggle('hidden', abiertos === 0);
        }

        function poblarSelectEstatus(sel, actual) {
            sel.innerHTML = '';
            ESTATUS_SEGUIMIENTO.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e; opt.innerText = e;
                if (e === actual) opt.selected = true;
                sel.appendChild(opt);
            });
        }

        function poblarSelectOrdenes() {
            const sel = document.getElementById('segOrden');
            sel.innerHTML = '';
            const opt0 = document.createElement('option');
            opt0.value = ''; opt0.innerText = 'Sin orden vinculada';
            sel.appendChild(opt0);
            datosDetalleOrdenes
                .filter(d => d.Cliente === clienteActual)
                .slice()
                .sort((a, b) => (b.FechaObj ? b.FechaObj.getTime() : 0) - (a.FechaObj ? a.FechaObj.getTime() : 0))
                .forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.ID;
                    opt.innerText = '#' + o.ID + ' · ' + o.Equipo + ' — ' + (o['Tipo de Servicio'] || 'Servicio') + ' (' + o.FechaEjecucionStr + ')';
                    sel.appendChild(opt);
                });
        }

        function renderComunicacion() {
            if (!clienteActual) return;
            poblarSelectOrdenes();
            poblarSelectEstatus(document.getElementById('segEstatus'), 'Abierto');
            renderCanales();
            renderSeguimientos();
            actualizarBadgeCom();
            actualizarEstadoSync();
        }

        function renderCanales() {
            const cont = document.getElementById('listaCanales');
            const canales = canalesDelCliente().slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
            if (canales.length === 0) {
                cont.innerHTML = '<div class="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center text-xs text-slate-500">Aún no hay canales registrados para esta unidad.<br>Agrega el primero para dar seguimiento por WhatsApp, teléfono o correo.</div>';
                return;
            }
            cont.innerHTML = canales.map(c => {
                let accionPrincipal = '';
                if (c.tipo === 'WhatsApp') {
                    accionPrincipal = '<button data-accion="wa-canal" data-id="' + esc(c.id) + '" class="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">WhatsApp</button>';
                } else if (c.tipo === 'Teléfono') {
                    accionPrincipal = '<a href="tel:' + esc(soloDigitos(c.valor)) + '" class="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Llamar</a>';
                } else if (c.tipo === 'Email') {
                    // v2.7: abre el modal de envío con adjuntos en vez de mailto:
                    accionPrincipal = '<button data-accion="mail-canal" data-id="' + esc(c.id) + '" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Escribir correo</button>';
                }
                return '<div class="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-1">' +
                    '<div class="flex justify-between items-start gap-2">' +
                        '<div class="min-w-0"><p class="text-sm font-bold text-slate-800 truncate">' + esc(c.nombre) + '</p>' +
                        (c.cargo ? '<p class="text-xs text-slate-500 truncate">' + esc(c.cargo) + '</p>' : '') + '</div>' +
                        chip(c.tipo, 'bg-slate-100 text-slate-600 shrink-0') +
                    '</div>' +
                    '<p class="text-sm text-slate-700 font-medium break-all">' + esc(c.valor) + '</p>' +
                    (c.notas ? '<p class="text-xs text-slate-500 italic">' + esc(c.notas) + '</p>' : '') +
                    '<div class="flex flex-wrap gap-2 pt-1.5 no-print">' + accionPrincipal +
                        '<button data-accion="editar-canal" data-id="' + esc(c.id) + '" class="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors">Editar</button>' +
                        '<button data-accion="eliminar-canal" data-id="' + esc(c.id) + '" class="text-xs font-semibold text-red-400 hover:text-red-600 px-2 py-1.5 transition-colors">Eliminar</button>' +
                    '</div></div>';
            }).join('');
        }

        function renderSeguimientos() {
            const cont = document.getElementById('listaSeguimientos');
            const filtro = document.getElementById('filtroSeguimientos').value;
            const prioridadOrden = { 'Alta': 0, 'Media': 1, 'Baja': 2 };

            let lista = seguimientosDelCliente();
            if (filtro === 'abiertos') lista = lista.filter(s => s.estatus !== 'Concluido');
            if (filtro === 'concluidos') lista = lista.filter(s => s.estatus === 'Concluido');

            lista = lista.slice().sort((a, b) => {
                const ca = a.estatus === 'Concluido' ? 1 : 0, cb = b.estatus === 'Concluido' ? 1 : 0;
                if (ca !== cb) return ca - cb;
                const pa = prioridadOrden[a.prioridad] ?? 1, pb = prioridadOrden[b.prioridad] ?? 1;
                if (pa !== pb) return pa - pb;
                return String(b.actualizado || '').localeCompare(String(a.actualizado || ''));
            });

            if (lista.length === 0) {
                cont.innerHTML = '<div class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center text-xs text-slate-500">No hay seguimientos ' + (filtro === 'concluidos' ? 'concluidos' : (filtro === 'abiertos' ? 'abiertos' : 'registrados')) + ' para esta unidad.<br>Crea uno para dar seguimiento puntual a correctivos, cotizaciones o mantenimientos en curso.</div>';
                return;
            }

            const canalesWA = canalesDelCliente().filter(c => c.tipo === 'WhatsApp');

            cont.innerHTML = lista.map(s => {
                const concluido = s.estatus === 'Concluido';
                const historial = (s.historial || []).slice().reverse().map(h =>
                    '<div><p class="text-slate-400">' + esc(fmtFechaCorta(h.fecha)) + ' · ' + esc(h.autor || '') + ' · ' + chip(h.estatus || '', CLASES_ESTATUS[h.estatus] || 'bg-slate-100 text-slate-600') + '</p>' +
                    '<p class="text-slate-700 whitespace-pre-wrap">' + esc(h.nota || '') + '</p></div>'
                ).join('');

                const selectWA = canalesWA.length > 0
                    ? '<select data-wa-canal class="p-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none max-w-[11rem]">' +
                        canalesWA.map(c => '<option value="' + esc(c.id) + '">' + esc(c.nombre) + '</option>').join('') +
                      '</select>'
                    : '<span class="text-xs text-slate-400 italic">Sin WhatsApp registrado: se abrirá el selector de contactos</span>';

                const opcionesEstatus = ESTATUS_SEGUIMIENTO.map(e => '<option' + (e === s.estatus ? ' selected' : '') + '>' + esc(e) + '</option>').join('');

                return '<div data-seg-card="' + esc(s.id) + '" class="border border-slate-200 rounded-xl p-4 flex flex-col gap-2 ' + (concluido ? 'bg-slate-50' : 'bg-white') + '">' +
                    '<div class="flex flex-wrap items-center gap-2">' +
                        chip(s.prioridad, CLASES_PRIORIDAD[s.prioridad] || 'bg-slate-100 text-slate-600') +
                        chip(s.estatus, CLASES_ESTATUS[s.estatus] || 'bg-slate-100 text-slate-600') +
                        chip(s.tipo, 'bg-slate-100 text-slate-500') +
                        '<span class="text-xs text-slate-400 ml-auto">Creado: ' + esc(fmtFechaCorta(s.creado)) + '</span>' +
                    '</div>' +
                    '<div><p class="font-bold text-slate-800 text-sm">' + esc(s.titulo) + '</p>' +
                    (s.ordenId ? '<p class="text-xs text-slate-500 mt-0.5">Orden #' + esc(s.ordenId) + (s.ordenResumen ? ' — ' + esc(s.ordenResumen) : '') + '</p>' : '') + '</div>' +
                    (s.descripcion ? '<p class="text-xs text-slate-600 whitespace-pre-wrap">' + esc(s.descripcion) + '</p>' : '') +
                    '<details class="text-xs"><summary class="cursor-pointer font-semibold text-slate-500 hover:text-slate-700 select-none">Historial (' + (s.historial ? s.historial.length : 0) + ')</summary>' +
                        '<div class="mt-2 flex flex-col gap-2 border-l-2 border-slate-200 pl-3">' + (historial || '<p class="text-slate-400 italic">Sin registros.</p>') + '</div>' +
                    '</details>' +
                    (concluido ? '' :
                    '<div class="no-print flex flex-col sm:flex-row gap-2 pt-1">' +
                        '<select data-avance-estatus class="p-2 border border-slate-300 rounded-lg text-xs bg-white outline-none sm:w-44">' + opcionesEstatus + '</select>' +
                        '<input type="text" data-avance-nota placeholder="Registrar avance o acuerdo con el cliente…" class="flex-1 p-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-brand-500">' +
                        '<button data-accion="guardar-avance" data-id="' + esc(s.id) + '" class="bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">Registrar</button>' +
                    '</div>') +
                    '<div class="no-print flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">' +
                        selectWA +
                        '<button data-accion="wa-seg" data-id="' + esc(s.id) + '" class="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Enviar por WhatsApp</button>' +
                        '<button data-accion="mail-seg" data-id="' + esc(s.id) + '" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Enviar por correo</button>' +
                        (concluido ? '<button data-accion="reabrir-seg" data-id="' + esc(s.id) + '" class="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors">Reabrir</button>' : '') +
                        '<button data-accion="eliminar-seg" data-id="' + esc(s.id) + '" class="text-xs font-semibold text-red-400 hover:text-red-600 px-2 py-1.5 ml-auto transition-colors">Eliminar</button>' +
                    '</div></div>';
            }).join('');
        }

        // ---- CRUD de canales y seguimientos ----
        function guardarCanalDesdeFormulario() {
            const idEdit = document.getElementById('canalEditId').value;
            const nombre = document.getElementById('canalNombre').value.trim();
            const cargo = document.getElementById('canalCargo').value.trim();
            const tipo = document.getElementById('canalTipo').value;
            const valor = document.getElementById('canalValor').value.trim();
            const notas = document.getElementById('canalNotas').value.trim();

            if (!nombre || !valor) { avisar('El nombre del contacto y el número o correo son obligatorios.'); return; }
            if ((tipo === 'WhatsApp' || tipo === 'Teléfono') && soloDigitos(valor).length < 8) {
                avisar('El número parece incompleto. Verifica que incluya los 10 dígitos.'); return;
            }

            const existente = idEdit ? comData.canales.find(c => c.id === idEdit) : null;
            const reg = existente || { id: uid(), cliente: clienteActual, creado: ahoraISO() };
            reg.nombre = nombre; reg.cargo = cargo; reg.tipo = tipo; reg.valor = valor; reg.notas = notas;
            reg.actualizado = ahoraISO();
            if (!existente) comData.canales.push(reg);

            encolarCom('canal', reg);
            guardarComLocal();
            document.getElementById('formCanal').classList.add('hidden');
            renderComunicacion();
            registrarEvento(existente ? 'canal_editado' : 'canal_creado', tipo + ' · ' + nombre);
            procesarColaCom();
        }

        function abrirFormCanal(canal) {
            document.getElementById('canalEditId').value = canal ? canal.id : '';
            document.getElementById('canalNombre').value = canal ? canal.nombre : '';
            document.getElementById('canalCargo').value = canal ? (canal.cargo || '') : '';
            document.getElementById('canalTipo').value = canal ? canal.tipo : 'WhatsApp';
            document.getElementById('canalValor').value = canal ? canal.valor : '';
            document.getElementById('canalNotas').value = canal ? (canal.notas || '') : '';
            document.getElementById('formCanal').classList.remove('hidden');
            document.getElementById('canalNombre').focus();
        }

        async function eliminarCanal(id) {
            const reg = comData.canales.find(c => c.id === id);
            if (!reg) return;
            if (!(await confirmar('¿Eliminar el canal "' + reg.nombre + '"?', { titulo: 'Eliminar canal', textoSi: 'Eliminar', peligro: true }))) return;
            reg.eliminado = true;
            reg.actualizado = ahoraISO();
            encolarCom('canal', reg);
            guardarComLocal();
            renderComunicacion();
            registrarEvento('canal_eliminado', reg.tipo + ' · ' + reg.nombre);
            procesarColaCom();
        }

        function crearSeguimientoDesdeFormulario() {
            const ordenId = document.getElementById('segOrden').value;
            const titulo = document.getElementById('segTitulo').value.trim();
            const tipo = document.getElementById('segTipo').value;
            const prioridad = document.getElementById('segPrioridad').value;
            const estatus = document.getElementById('segEstatus').value;
            const descripcion = document.getElementById('segDescripcion').value.trim();

            if (!titulo) { avisar('Escribe el asunto del seguimiento.'); return; }

            let ordenResumen = '';
            if (ordenId) {
                const o = datosDetalleOrdenes.find(d => d.ID === ordenId && d.Cliente === clienteActual);
                if (o) ordenResumen = o.Equipo + ' · ' + o.Marca + ' ' + o.Modelo + ' · ' + (o['Tipo de Servicio'] || '') + ' · ' + o.FechaEjecucionStr;
            }

            const reg = {
                id: uid(), cliente: clienteActual,
                ordenId: ordenId || '', ordenResumen: ordenResumen,
                titulo: titulo, tipo: tipo, prioridad: prioridad, estatus: estatus,
                descripcion: descripcion,
                creado: ahoraISO(), actualizado: ahoraISO(),
                historial: [{ id: uid(), fecha: ahoraISO(), autor: nombreUsuario(), estatus: estatus, nota: descripcion || 'Seguimiento creado' }]
            };
            comData.seguimientos.push(reg);
            encolarCom('seguimiento', reg);
            guardarComLocal();
            document.getElementById('formSeguimiento').classList.add('hidden');
            document.getElementById('segTitulo').value = '';
            document.getElementById('segDescripcion').value = '';
            renderComunicacion();
            registrarEvento('seguimiento_creado', '#' + (reg.ordenId || 's/orden') + ' · ' + reg.titulo);
            procesarColaCom();
        }

        function agregarAvance(id, nota, estatus) {
            const reg = comData.seguimientos.find(s => s.id === id);
            if (!reg) return;
            reg.historial = reg.historial || [];
            reg.historial.push({ id: uid(), fecha: ahoraISO(), autor: nombreUsuario(), estatus: estatus, nota: nota || ('Estatus actualizado a ' + estatus) });
            reg.estatus = estatus;
            reg.actualizado = ahoraISO();
            encolarCom('seguimiento', reg);
            guardarComLocal();
            renderComunicacion();
            registrarEvento('seguimiento_actualizado', '#' + (reg.ordenId || 's/orden') + ' · ' + reg.titulo + ' → ' + estatus);
            procesarColaCom();
        }

        async function eliminarSeguimiento(id) {
            const reg = comData.seguimientos.find(s => s.id === id);
            if (!reg) return;
            if (!(await confirmar('¿Eliminar el seguimiento "' + reg.titulo + '"?\nSu historial también se eliminará.', { titulo: 'Eliminar seguimiento', textoSi: 'Eliminar', peligro: true }))) return;
            reg.eliminado = true;
            reg.actualizado = ahoraISO();
            encolarCom('seguimiento', reg);
            guardarComLocal();
            renderComunicacion();
            registrarEvento('seguimiento_eliminado', reg.titulo);
            procesarColaCom();
        }

        /* ============================================================
           v2.7 — CORREO AL CLIENTE CON ADJUNTOS
           mailto: no puede llevar archivos: es una limitación del protocolo.
           El envío real lo hace Apps Script (GmailApp), lo que además deja el
           correo en la cuenta institucional y no en el correo personal de
           quien lo manda. Cada envío queda como avance del seguimiento.
           ============================================================ */

        const MAX_ADJUNTOS_MB_UI = 10;
        let correoCtx = { segId: '', archivos: [], urls: [] };

        const bytesLegibles = (b) =>
            b < 1024 ? b + ' B' : (b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');

        const totalBytesCorreo = () => correoCtx.archivos.reduce((s, a) => s + a.size, 0);

        const canalesEmailDelCliente = () => canalesDelCliente().filter(c => c.tipo === 'Email');

        function textoCorreoSeguimiento(s, nombreContacto) {
            const ult = (s && s.historial && s.historial.length) ? s.historial[s.historial.length - 1] : null;
            const yo = nombreUsuario();
            return [
                'Estimado(a)' + (nombreContacto ? ' ' + nombreContacto : '') + ':',
                '',
                'Damos seguimiento a los servicios de mantenimiento en ' + clienteActual + '.',
                '',
                s.ordenId ? ('Orden de trabajo: #' + s.ordenId + (s.ordenResumen ? ' — ' + s.ordenResumen : '')) : null,
                'Asunto: ' + s.titulo,
                'Estatus actual: ' + s.estatus,
                (ult && ult.nota) ? ('Último avance: ' + ult.nota) : (s.descripcion ? ('Detalle: ' + s.descripcion) : null),
                '',
                'Quedamos atentos a sus comentarios para continuar con la atención correspondiente.',
                '',
                'Atentamente,',
                (yo !== 'Sin identificar' ? yo : 'Departamento de Servicio'),
                'Ingenieros Asociados'
            ].filter(l => l !== null).join('\n');
        }

        function htmlCorreoSeguimiento(texto, s) {
            const cuerpo = esc(texto).replace(/\n/g, '<br>');
            const ficha = s.ordenId
                ? '<table style="border-collapse:collapse;margin:14px 0;font-size:13px">' +
                  '<tr><td style="padding:4px 10px;background:#f1f5f9;font-weight:bold">Orden</td>' +
                  '<td style="padding:4px 10px;border:1px solid #e2e8f0">#' + esc(s.ordenId) + '</td></tr>' +
                  '<tr><td style="padding:4px 10px;background:#f1f5f9;font-weight:bold">Equipo</td>' +
                  '<td style="padding:4px 10px;border:1px solid #e2e8f0">' + esc(s.ordenResumen || '—') + '</td></tr>' +
                  '<tr><td style="padding:4px 10px;background:#f1f5f9;font-weight:bold">Estatus</td>' +
                  '<td style="padding:4px 10px;border:1px solid #e2e8f0">' + esc(s.estatus) + '</td></tr></table>'
                : '';
            return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">' +
                   cuerpo + ficha + '</div>';
        }

        function mensajeCorreoUI(texto, tipo) {
            const p = document.getElementById('correoMensaje');
            const estilos = {
                error: 'bg-red-50 text-red-700 border border-red-200',
                ok:    'bg-green-50 text-green-700 border border-green-200',
                info:  'bg-slate-100 text-slate-600 border border-slate-200'
            };
            p.className = 'text-xs rounded-lg p-3 ' + (estilos[tipo] || estilos.info);
            p.innerText = texto;
            p.classList.toggle('hidden', !texto);
        }

        function renderAdjuntosCorreo() {
            const cont = document.getElementById('correoListaAdjuntos');
            if (correoCtx.archivos.length === 0) {
                cont.innerHTML = '<p class="text-xs text-slate-400 italic">Sin archivos adjuntos.</p>';
                return;
            }
            const total = totalBytesCorreo();
            cont.innerHTML = correoCtx.archivos.map((a, i) =>
                '<div class="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">' +
                    '<span class="text-xs text-slate-700 truncate">' + esc(a.name) + '</span>' +
                    '<span class="text-xs text-slate-400 shrink-0">' + bytesLegibles(a.size) + '</span>' +
                    '<button data-accion="quitar-adjunto" data-idx="' + i + '" class="text-red-400 hover:text-red-600 text-xs font-bold px-1">Quitar</button>' +
                '</div>'
            ).join('') +
            '<p class="text-xs ' + (total > MAX_ADJUNTOS_MB_UI * 1048576 ? 'text-red-600 font-bold' : 'text-slate-500') +
            ' mt-1">Total: ' + bytesLegibles(total) + ' de ' + MAX_ADJUNTOS_MB_UI + ' MB permitidos</p>';
        }

        function abrirModalCorreo(segId, canalId) {
            const s = comData.seguimientos.find(x => x.id === segId);
            if (!s) return;

            const canal = canalId ? comData.canales.find(c => c.id === canalId) : null;
            const emails = canalesEmailDelCliente();
            const correoOrden = (document.getElementById('clienteCorreo').innerText || '').trim();

            // Sin backend: se abre el programa de correo del equipo, sin adjuntos
            if (!hayBackend()) {
                const destino = canal ? canal.valor : (emails[0] ? emails[0].valor : correoOrden);
                const texto = textoCorreoSeguimiento(s, canal ? canal.nombre : '');
                window.location.href = 'mailto:' + encodeURIComponent(destino || '') +
                    '?subject=' + encodeURIComponent('Seguimiento de servicio · ' + clienteActual + (s.ordenId ? ' · Orden #' + s.ordenId : '')) +
                    '&body=' + encodeURIComponent(texto);
                mostrarAviso('Se abrió tu programa de correo sin adjuntos. Para enviar archivos desde la plataforma, configura URL_APPS_SCRIPT.');
                return;
            }

            correoCtx = { segId: segId, archivos: [], urls: [] };

            const nombreContacto = canal ? canal.nombre : (emails[0] ? emails[0].nombre : '');
            const destinatarios = canal ? canal.valor
                                        : (emails.length ? emails.map(c => c.valor).join(', ')
                                                         : (correoOrden.includes('@') ? correoOrden : ''));

            document.getElementById('correoContexto').innerText =
                clienteActual + (s.ordenId ? ' · Orden #' + s.ordenId : '') + ' · ' + s.titulo;
            document.getElementById('correoPara').value = destinatarios;
            document.getElementById('correoCC').value = '';
            document.getElementById('correoAsunto').value =
                'Seguimiento de servicio · ' + clienteActual + (s.ordenId ? ' · Orden #' + s.ordenId : '');
            document.getElementById('correoCuerpo').value = textoCorreoSeguimiento(s, nombreContacto);
            document.getElementById('correoModo').value = 'enviar';

            document.getElementById('correoSugerencias').innerText = emails.length
                ? 'Canales registrados: ' + emails.map(c => c.nombre + ' <' + c.valor + '>').join(' · ')
                : 'Esta unidad no tiene canales de tipo Email. Agrega uno para no volver a escribir la dirección.';

            const orden = s.ordenId ? datosDetalleOrdenes.find(d => d.ID === s.ordenId && d.Cliente === clienteActual) : null;
            correoCtx.urls = (orden && orden.Fotos) ? orden.Fotos.map(f => f.url) : [];
            const wrap = document.getElementById('correoEvidenciaWrap');
            wrap.classList.toggle('hidden', correoCtx.urls.length === 0);
            document.getElementById('correoEvidencia').checked = false;
            if (correoCtx.urls.length) {
                wrap.querySelector('span').innerText =
                    'Adjuntar la evidencia fotográfica de la orden (' + correoCtx.urls.length + ' imagen(es))';
            }

            renderAdjuntosCorreo();
            mensajeCorreoUI('', 'info');
            const modal = document.getElementById('modalCorreo');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            document.getElementById('correoPara').focus();
        }

        function cerrarModalCorreo() {
            const modal = document.getElementById('modalCorreo');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            correoCtx = { segId: '', archivos: [], urls: [] };
        }

        function archivoABase64(file) {
            return new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
                fr.onerror = () => reject(new Error('No se pudo leer ' + file.name));
                fr.readAsDataURL(file);
            });
        }

        async function enviarCorreoSeguimiento() {
            const s = comData.seguimientos.find(x => x.id === correoCtx.segId);
            if (!s) return;

            const para = document.getElementById('correoPara').value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
            const cc = document.getElementById('correoCC').value.split(/[,;]/).map(x => x.trim()).filter(Boolean);
            const asunto = document.getElementById('correoAsunto').value.trim();
            const cuerpo = document.getElementById('correoCuerpo').value;
            const modo = document.getElementById('correoModo').value;

            if (para.length === 0 || !para.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) {
                mensajeCorreoUI('Revisa el campo Para: cada dirección debe tener el formato nombre@dominio.', 'error');
                return;
            }
            if (!asunto) { mensajeCorreoUI('Escribe el asunto del correo.', 'error'); return; }
            if (totalBytesCorreo() > MAX_ADJUNTOS_MB_UI * 1048576) {
                mensajeCorreoUI('Los adjuntos superan ' + MAX_ADJUNTOS_MB_UI + ' MB. Quita alguno o comparte el archivo por Drive.', 'error');
                return;
            }

            const btn = document.getElementById('btnEnviarCorreo');
            btn.disabled = true;
            btn.innerText = modo === 'borrador' ? 'Guardando…' : 'Enviando…';
            mensajeCorreoUI('Preparando el mensaje…', 'info');

            try {
                const adjuntos = [];
                for (const f of correoCtx.archivos) {
                    adjuntos.push({ nombre: f.name, tipo: f.type || 'application/octet-stream', datos: await archivoABase64(f) });
                }
                const incluirEvidencia = document.getElementById('correoEvidencia').checked;

                const r = await fetch(URL_APPS_SCRIPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        accion: 'correo', token: tokenSesion(), modo: modo,
                        para: para, cc: cc, asunto: asunto,
                        cuerpo: cuerpo, html: htmlCorreoSeguimiento(cuerpo, s),
                        adjuntos: adjuntos,
                        urlsAdjuntas: incluirEvidencia ? correoCtx.urls : [],
                        cliente: clienteActual, seguimientoId: s.id, ordenId: s.ordenId || '',
                        usuario: nombreUsuario()
                    })
                });
                const j = await r.json().catch(() => null);
                if (!j || !j.ok) throw new Error((j && j.error) || 'El servidor respondió de forma inesperada.');

                const resumen = (modo === 'borrador' ? 'Borrador creado para ' : 'Correo enviado a ') + para.join(', ') +
                                (j.adjuntos ? ' con ' + j.adjuntos + ' adjunto(s)' : '');
                agregarAvance(s.id, resumen, s.estatus);
                registrarEvento('correo_enviado', resumen + ' · ' + s.titulo);
                cerrarModalCorreo();
                mostrarAviso(resumen + '. Quedó registrado en el historial del seguimiento.');
            } catch (err) {
                mensajeCorreoUI('No se envió: ' + err.message +
                    ' Verifica que Code.gs esté implementado en su versión más reciente y que hayas autorizado los permisos de Gmail.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Enviar correo';
            }
        }

        document.getElementById('correoArchivos').addEventListener('change', (e) => {
            Array.from(e.target.files || []).forEach(f => correoCtx.archivos.push(f));
            e.target.value = '';
            renderAdjuntosCorreo();
        });

        document.getElementById('modalCorreo').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-accion]');
            if (!btn) return;
            const accion = btn.dataset.accion;
            if (accion === 'cerrar-correo')  { cerrarModalCorreo(); return; }
            if (accion === 'enviar-correo')  { enviarCorreoSeguimiento(); return; }
            if (accion === 'quitar-adjunto') {
                correoCtx.archivos.splice(parseInt(btn.dataset.idx, 10), 1);
                renderAdjuntosCorreo();
                return;
            }
        });

        // Delegación de eventos de toda la pestaña de comunicación
        document.getElementById('contentCom').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-accion]');
            if (!btn) return;
            const accion = btn.dataset.accion;
            const id = btn.dataset.id;

            if (accion === 'nuevo-canal') { abrirFormCanal(null); return; }
            if (accion === 'cancelar-canal') { document.getElementById('formCanal').classList.add('hidden'); return; }
            if (accion === 'guardar-canal') { guardarCanalDesdeFormulario(); return; }
            if (accion === 'editar-canal') { const c = comData.canales.find(x => x.id === id); if (c) abrirFormCanal(c); return; }
            if (accion === 'eliminar-canal') { eliminarCanal(id); return; }
            if (accion === 'wa-canal') {
                const c = comData.canales.find(x => x.id === id);
                if (!c) return;
                window.open(urlWhatsApp(normalizarWhatsApp(c.valor), mensajeWhatsAppCanal(c)), '_blank');
                registrarEvento('whatsapp_abierto', 'Canal: ' + c.nombre);
                return;
            }

            if (accion === 'nuevo-seg') {
                poblarSelectOrdenes();
                poblarSelectEstatus(document.getElementById('segEstatus'), 'Abierto');
                document.getElementById('formSeguimiento').classList.remove('hidden');
                document.getElementById('segTitulo').focus();
                return;
            }
            if (accion === 'cancelar-seg') { document.getElementById('formSeguimiento').classList.add('hidden'); return; }
            if (accion === 'guardar-seg') { crearSeguimientoDesdeFormulario(); return; }
            if (accion === 'eliminar-seg') { eliminarSeguimiento(id); return; }
            if (accion === 'reabrir-seg') { agregarAvance(id, 'Seguimiento reabierto', 'En proceso'); return; }
            if (accion === 'guardar-avance') {
                const card = btn.closest('[data-seg-card]');
                if (!card) return;
                const estatus = card.querySelector('[data-avance-estatus]').value;
                const notaInput = card.querySelector('[data-avance-nota]');
                agregarAvance(id, notaInput.value.trim(), estatus);
                return;
            }
            if (accion === 'mail-seg') { abrirModalCorreo(id, ''); return; }

            if (accion === 'mail-canal') {
                const c = comData.canales.find(x => x.id === id);
                if (!c) return;
                // El correo se manda asociado a un pendiente para que quede en su historial
                const abiertos = seguimientosDelCliente()
                    .filter(x => x.estatus !== 'Concluido')
                    .sort((a, b) => String(b.actualizado || '').localeCompare(String(a.actualizado || '')));
                if (abiertos.length === 0) {
                    avisar('Crea primero un seguimiento para esta unidad: el correo se envía asociado a un pendiente y queda en su historial.');
                    return;
                }
                abrirModalCorreo(abiertos[0].id, c.id);
                return;
            }

            if (accion === 'wa-seg') {
                const s = comData.seguimientos.find(x => x.id === id);
                if (!s) return;
                const card = btn.closest('[data-seg-card]');
                const selWA = card ? card.querySelector('[data-wa-canal]') : null;
                let numero = '';
                if (selWA && selWA.value) {
                    const c = comData.canales.find(x => x.id === selWA.value);
                    if (c) numero = normalizarWhatsApp(c.valor);
                }
                window.open(urlWhatsApp(numero, mensajeWhatsAppSeguimiento(s)), '_blank');
                registrarEvento('whatsapp_abierto', 'Seguimiento: ' + s.titulo);
                return;
            }
        });

        document.getElementById('filtroSeguimientos').addEventListener('change', renderComunicacion);
        document.getElementById('comSyncEstado').addEventListener('click', () => { if (hayBackend()) sincronizarComRemoto(); });
        window.addEventListener('online', procesarColaCom);
        // v2.7: al volver a la pestaña se resincroniza (útil tras recuperar señal)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && hayBackend()) sincronizarComRemoto();
        });

        /* ============================================================
           v2.6 — ATAJOS Y ARRANQUE
           ============================================================ */
        document.getElementById('btnRefrescar').addEventListener('click', () => {
            registrarEvento('actualizar_datos');
            cargarDatos(true);   // v2.7: ignora la caché de sesión y la del servidor
        });

        // Escape cierra la rutina o el modal de oportunidades (nunca el de acceso)
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const mf = document.getElementById('modalFactura');
            if (!mf.classList.contains('hidden')) { cerrarModalFactura(); return; }
            const mp = document.getElementById('modalCambiarPin');
            if (!mp.classList.contains('hidden')) { cerrarCambiarPin(); return; }
            const mc = document.getElementById('modalCorreo');
            if (!mc.classList.contains('hidden')) { cerrarModalCorreo(); return; }
            const mr = document.getElementById('modalRutina');
            if (!mr.classList.contains('hidden')) { cerrarRutina(); return; }
            const mo = document.getElementById('modalOportunidades');
            if (!mo.classList.contains('hidden')) mo.classList.add('hidden');
        });
        document.getElementById('modalOportunidades').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
        });

        function iniciarAplicacion() {
            cargarComLocal();
            if (gateActivo() && !sesionActual()) {
                mostrarModalAcceso();
            } else {
                mostrarUsuarioSidebar();
                registrarEvento('visita');
                cargarDatos();
            }
        }

        window.onload = iniciarAplicacion;
