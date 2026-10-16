// W&P Workshop Management Application JS
let currentTab = 'calculadora';
let pedidosData = [];
let stockData = [];
let forniturasData = [];
let balanceData = {};
let estadisticasData = null;
let balanceChart = null;
let evolucionMensualChart = null;
let stockColoresChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCalculator();
    loadAllData();
});

// --- TABS NAVIGATION ---
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            switchTab(target);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.getAttribute('data-tab') === tabName) {
            b.classList.add('bg-blue-600', 'text-white');
            b.classList.remove('text-slate-400', 'hover:bg-slate-800');
        } else {
            b.classList.remove('bg-blue-600', 'text-white');
            b.classList.add('text-slate-400', 'hover:bg-slate-800');
        }
    });

    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
    });

    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.add('active');
    }

    if (tabName === 'balance') {
        renderBalanceChart();
        renderEstadisticasCharts();
    }
}

// --- DATA LOADING ---
async function loadAllData() {
    await Promise.all([
        checkDbStatus(),
        loadBalance(),
        loadPedidos(),
        loadStock(),
        loadFornituras(),
        loadGastos()
    ]);
}

async function loadBalance() {
    try {
        const [resBal, resStats] = await Promise.all([
            fetch('/api/balance'),
            fetch('/api/estadisticas')
        ]);
        balanceData = await resBal.json();
        if (resStats.ok) {
            estadisticasData = await resStats.json();
            updateEstadisticasUI();
        }
        updateBalanceUI();
    } catch (e) {
        console.error('Error cargando balance:', e);
    }
}

function updateBalanceUI() {
    if (!balanceData.ingresos) return;

    // Header Quick Stats
    document.getElementById('quick-total-facturado').innerText = `${balanceData.ingresos.total_facturado.toFixed(2)} €`;
    
    const pendEl = document.getElementById('quick-pendiente');
    pendEl.innerText = `${balanceData.ingresos.pendiente_cobro.toFixed(2)} €`;
    if (balanceData.ingresos.pendiente_cobro > 0) {
        pendEl.classList.add('text-red-400', 'font-bold');
        document.getElementById('quick-pendiente-badge').classList.remove('hidden');
    } else {
        pendEl.classList.remove('text-red-400', 'font-bold');
        document.getElementById('quick-pendiente-badge').classList.add('hidden');
    }

    // Settlement Badge
    const liq = balanceData.liquidacion;
    const badgeLiq = document.getElementById('quick-liquidacion-text');
    if (liq.quien_debe) {
        badgeLiq.innerHTML = `<span class="text-amber-400 font-semibold">${liq.quien_debe}</span> debe a <span class="text-emerald-400 font-semibold">${liq.a_quien}</span>: <strong>${liq.cantidad_a_transferir.toFixed(2)} €</strong>`;
    } else {
        badgeLiq.innerHTML = `<span class="text-emerald-400 font-semibold">Cuentas al día</span> (50/50)`;
    }

    // Balance Tab Cards
    document.getElementById('bal-total-ingresos').innerText = `${balanceData.ingresos.total_facturado.toFixed(2)} €`;
    document.getElementById('bal-cobrado-pablo').innerText = `${balanceData.ingresos.cobrado_pablo.toFixed(2)} €`;
    document.getElementById('bal-cobrado-javi').innerText = `${balanceData.ingresos.cobrado_javi.toFixed(2)} €`;
    document.getElementById('bal-pendiente').innerText = `${balanceData.ingresos.pendiente_cobro.toFixed(2)} €`;

    document.getElementById('bal-mat-pablo').innerText = `${balanceData.gastos_material.pablo.toFixed(2)} €`;
    document.getElementById('bal-mat-javi').innerText = `${balanceData.gastos_material.javi.toFixed(2)} €`;
    document.getElementById('bal-mat-total').innerText = `${balanceData.gastos_material.total.toFixed(2)} €`;

    document.getElementById('bal-maq-total').innerText = `${balanceData.gastos_maquinaria.total.toFixed(2)} €`;
    document.getElementById('bal-fondo-ci').innerText = `${balanceData.fondo_indirectos.total_acumulado.toFixed(2)} €`;

    // Settlement Box in Tab
    document.getElementById('settlement-message').innerText = liq.mensaje;
    document.getElementById('settlement-pablo-net').innerText = `${liq.dinero_neto_pablo.toFixed(2)} €`;
    document.getElementById('settlement-javi-net').innerText = `${liq.dinero_neto_javi.toFixed(2)} €`;
    document.getElementById('settlement-ideal-half').innerText = `${liq.cuota_ideal_cada_uno.toFixed(2)} €`;

    // Resumen de efectivo real y total transferido
    const totalTransEl = document.getElementById('settlement-total-transferido');
    if (totalTransEl) {
        totalTransEl.innerText = `${(liq.total_transferido_acumulado || 0).toFixed(2)} €`;
    }
    const realPabloEl = document.getElementById('settlement-real-pablo');
    if (realPabloEl) {
        realPabloEl.innerText = `${(liq.dinero_real_pablo !== undefined ? liq.dinero_real_pablo : liq.dinero_neto_pablo).toFixed(2)} €`;
    }
    const realJaviEl = document.getElementById('settlement-real-javi');
    if (realJaviEl) {
        realJaviEl.innerText = `${(liq.dinero_real_javi !== undefined ? liq.dinero_real_javi : liq.dinero_neto_javi).toFixed(2)} €`;
    }

    // Botón de cuadre rápido
    const btnCuadrar = document.getElementById('btn-cuadrar-rapido');
    const btnCuadrarText = document.getElementById('btn-cuadrar-rapido-text');
    if (btnCuadrar) {
        if (liq.quien_debe && liq.cantidad_a_transferir > 0.01) {
            btnCuadrar.classList.remove('hidden');
            if (btnCuadrarText) {
                btnCuadrarText.innerText = `Cuadrar ${liq.cantidad_a_transferir.toFixed(2)} € (${liq.quien_debe} ➡️ ${liq.a_quien})`;
            }
        } else {
            btnCuadrar.classList.add('hidden');
        }
    }

    // Tabla de transferencias
    renderTransferenciasTable(balanceData.transferencias || []);

    // Pending Orders Alert List
    const pendList = document.getElementById('pending-orders-list');
    pendList.innerHTML = '';
    if (balanceData.pedidos_pendientes && balanceData.pedidos_pendientes.length > 0) {
        balanceData.pedidos_pendientes.forEach(p => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-sm';
            item.innerHTML = `
                <div>
                    <span class="font-bold text-red-300">#${p.id} - ${p.titulo}</span>
                    <span class="text-slate-400 ml-2">(${p.cliente})</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold text-red-200">${p.precio_total.toFixed(2)} €</span>
                    <button onclick="marcarCobrado('${p.id}', 'J')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs">Cobró Javi</button>
                    <button onclick="marcarCobrado('${p.id}', 'P')" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs">Cobró Pablo</button>
                </div>
            `;
            pendList.appendChild(item);
        });
    } else {
        pendList.innerHTML = '<div class="text-slate-400 text-sm italic">No hay pedidos pendientes de cobro. ¡Todo al día!</div>';
    }
}

// --- CALCULADORA ---
let proyectosCalculadoraData = [];

function getCalculadoraFormData() {
    const calcInputs = [
        'calc-titulo', 'calc-piezas-totales', 'calc-precio-kg', 'calc-g-tirada',
        'calc-piezas-tirada', 'calc-perdidas-3d', 'calc-coste-cambio-3d',
        'calc-tiempo-diseno-3d', 'calc-precio-hora-diseno', 'calc-colores',
        'calc-min-tirada-3d', 'calc-incluir-laser', 'calc-precio-m2-madera',
        'calc-largo-tablero', 'calc-ancho-tablero', 'calc-piezas-tablero',
        'calc-perdidas-laser', 'calc-tiempo-diseno-laser', 'calc-incluir-montaje',
        'calc-pegar-ud', 'calc-llaveros-ud', 'calc-fornituras-ud', 'calc-cola-fijo',
        'calc-descuento-pct', 'calc-aplicar-iva'
    ];
    const data = {};
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            data[id] = (el.type === 'checkbox') ? el.checked : el.value;
        }
    });
    data['calcColoresFilamentos'] = calcColoresFilamentos;
    return data;
}

function setCalculadoraFormData(data) {
    if (!data) return;
    Object.keys(data).forEach(id => {
        if (id === 'calcColoresFilamentos') return;
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = Boolean(data[id]);
            } else {
                el.value = data[id];
            }
        }
    });
    if (Array.isArray(data['calcColoresFilamentos'])) {
        calcColoresFilamentos = data['calcColoresFilamentos'];
        renderFilasColorCalculadora();
    }
    // Toggle accordions
    const laserCheck = document.getElementById('calc-incluir-laser');
    const laserBox = document.getElementById('laser-params-box');
    if (laserCheck && laserBox) laserBox.classList.toggle('hidden', !laserCheck.checked);

    const montajeCheck = document.getElementById('calc-incluir-montaje');
    const montajeBox = document.getElementById('montaje-params-box');
    if (montajeCheck && montajeBox) montajeBox.classList.toggle('hidden', !montajeCheck.checked);
}

function guardarDraftCalculadora() {
    try {
        const data = getCalculadoraFormData();
        localStorage.setItem('wp_calc_draft', JSON.stringify(data));
    } catch (e) {}
}

function restaurarDraftCalculadora() {
    try {
        const raw = localStorage.getItem('wp_calc_draft');
        if (raw) {
            const data = JSON.parse(raw);
            setCalculadoraFormData(data);
        }
    } catch (e) {}
}

async function loadProyectosCalculadora() {
    try {
        const res = await fetch('/api/calculadora/proyectos');
        if (res.ok) {
            proyectosCalculadoraData = await res.json();
            try { localStorage.setItem('wp_saved_projects', JSON.stringify(proyectosCalculadoraData)); } catch(e){}
        } else {
            throw new Error('Server returned ' + res.status);
        }
    } catch (e) {
        console.warn('Cargando proyectos desde localStorage fallback:', e);
        try {
            const cached = localStorage.getItem('wp_saved_projects');
            if (cached) proyectosCalculadoraData = JSON.parse(cached);
        } catch(err){}
    }
    actualizarSelectProyectosCalculadora();
}

function actualizarSelectProyectosCalculadora() {
    const select = document.getElementById('calc-proyectos-guardados-select');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Cargar diseño guardado --</option>';
    proyectosCalculadoraData.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.nombre} (${p.fecha || ''})`;
        select.appendChild(opt);
    });
    if (currentVal && proyectosCalculadoraData.some(p => String(p.id) === String(currentVal))) {
        select.value = currentVal;
    }
    const btnBorrar = document.getElementById('btn-borrar-diseno-calc');
    if (btnBorrar) {
        btnBorrar.classList.toggle('hidden', !select.value);
    }
}

async function guardarDisenoCalculadora() {
    const tituloActual = document.getElementById('calc-titulo').value || 'Mi Diseño';
    const nombre = prompt('Introduce un nombre para guardar este diseño:', tituloActual);
    if (!nombre || !nombre.trim()) return;

    const datos = getCalculadoraFormData();
    datos['calc-titulo'] = nombre.trim();
    document.getElementById('calc-titulo').value = nombre.trim();

    const payload = {
        nombre: nombre.trim(),
        datos: datos,
        resultado: lastCalculoResultado || {}
    };

    try {
        const res = await fetch('/api/calculadora/proyectos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const saved = await res.json();
            mostrarNotificacion(`Diseño "${nombre}" guardado con éxito.`);
            await loadProyectosCalculadora();
            const select = document.getElementById('calc-proyectos-guardados-select');
            if (select) select.value = saved.id;
            const btnBorrar = document.getElementById('btn-borrar-diseno-calc');
            if (btnBorrar) btnBorrar.classList.remove('hidden');
        } else {
            const err = await res.json().catch(() => ({}));
            alert('Error al guardar diseño en servidor: ' + (err.detail || res.statusText));
        }
    } catch (e) {
        // Fallback local
        const localId = 'loc_' + Date.now();
        const localItem = {
            id: localId,
            nombre: nombre.trim(),
            fecha: new Date().toISOString().split('T')[0],
            datos: datos,
            resultado: lastCalculoResultado || {}
        };
        proyectosCalculadoraData.unshift(localItem);
        try { localStorage.setItem('wp_saved_projects', JSON.stringify(proyectosCalculadoraData)); } catch(err){}
        actualizarSelectProyectosCalculadora();
        const select = document.getElementById('calc-proyectos-guardados-select');
        if (select) select.value = localId;
        mostrarNotificacion(`Diseño "${nombre}" guardado localmente.`);
    }
}

function cargarDisenoSeleccionado(pid) {
    const btnBorrar = document.getElementById('btn-borrar-diseno-calc');
    if (!pid) {
        if (btnBorrar) btnBorrar.classList.add('hidden');
        return;
    }
    const proj = proyectosCalculadoraData.find(p => String(p.id) === String(pid));
    if (!proj) return;

    if (btnBorrar) btnBorrar.classList.remove('hidden');
    setCalculadoraFormData(proj.datos);
    guardarDraftCalculadora();
    ejecutarCalculo();
    mostrarNotificacion(`Diseño "${proj.nombre}" cargado.`);
}

async function borrarDisenoCalculadora() {
    const select = document.getElementById('calc-proyectos-guardados-select');
    const pid = select.value;
    if (!pid) return;

    const proj = proyectosCalculadoraData.find(p => String(p.id) === String(pid));
    const nombre = proj ? proj.nombre : 'este diseño';

    if (!confirm(`¿Eliminar el diseño guardado "${nombre}"?`)) return;

    try {
        await fetch(`/api/calculadora/proyectos/${pid}`, { method: 'DELETE' });
    } catch (e) {
        console.warn('Error eliminando en servidor:', e);
    }

    proyectosCalculadoraData = proyectosCalculadoraData.filter(p => String(p.id) !== String(pid));
    try { localStorage.setItem('wp_saved_projects', JSON.stringify(proyectosCalculadoraData)); } catch(err){}
    actualizarSelectProyectosCalculadora();
    select.value = '';
    const btnBorrar = document.getElementById('btn-borrar-diseno-calc');
    if (btnBorrar) btnBorrar.classList.add('hidden');
    mostrarNotificacion(`Diseño eliminado.`);
}

function initCalculator() {
    const calcInputs = [
        'calc-titulo', 'calc-piezas-totales', 'calc-precio-kg', 'calc-g-tirada',
        'calc-piezas-tirada', 'calc-perdidas-3d', 'calc-coste-cambio-3d',
        'calc-tiempo-diseno-3d', 'calc-precio-hora-diseno', 'calc-colores',
        'calc-min-tirada-3d', 'calc-incluir-laser', 'calc-precio-m2-madera',
        'calc-largo-tablero', 'calc-ancho-tablero', 'calc-piezas-tablero',
        'calc-perdidas-laser', 'calc-tiempo-diseno-laser', 'calc-incluir-montaje',
        'calc-pegar-ud', 'calc-llaveros-ud', 'calc-fornituras-ud', 'calc-cola-fijo',
        'calc-descuento-pct', 'calc-aplicar-iva'
    ];

    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                if (id === 'calc-piezas-totales' || id === 'calc-piezas-tirada') {
                    actualizarCalculosColores();
                }
                guardarDraftCalculadora();
                ejecutarCalculo();
            });
            el.addEventListener('change', () => {
                if (id === 'calc-piezas-totales' || id === 'calc-piezas-tirada') {
                    actualizarCalculosColores();
                }
                guardarDraftCalculadora();
                ejecutarCalculo();
            });
        }
    });

    // Toggle laser & montaje accordions
    document.getElementById('calc-incluir-laser').addEventListener('change', (e) => {
        const box = document.getElementById('laser-params-box');
        if (e.target.checked) box.classList.remove('hidden');
        else box.classList.add('hidden');
    });

    document.getElementById('calc-incluir-montaje').addEventListener('change', (e) => {
        const box = document.getElementById('montaje-params-box');
        if (e.target.checked) box.classList.remove('hidden');
        else box.classList.add('hidden');
    });

    // Preset selector
    document.getElementById('calc-preset-select').addEventListener('change', (e) => {
        aplicarPreset(e.target.value);
    });

    // Mis Diseños selector
    const disenoSelect = document.getElementById('calc-proyectos-guardados-select');
    if (disenoSelect) {
        disenoSelect.addEventListener('change', (e) => {
            cargarDisenoSeleccionado(e.target.value);
        });
    }

    // Load saved projects list
    loadProyectosCalculadora();

    // Restore draft if any exists
    restaurarDraftCalculadora();

    // Run first calculation
    ejecutarCalculo();
}

function aplicarPreset(nombre) {
    if (nombre === 'llavero-simple') {
        document.getElementById('calc-titulo').value = 'Llavero Simple';
        document.getElementById('calc-piezas-totales').value = 50;
        document.getElementById('calc-g-tirada').value = 25;
        document.getElementById('calc-piezas-tirada').value = 10;
        document.getElementById('calc-colores').value = 1;
        document.getElementById('calc-tiempo-diseno-3d').value = 1.0;
        document.getElementById('calc-incluir-laser').checked = false;
        document.getElementById('calc-incluir-montaje').checked = true;
        document.getElementById('calc-llaveros-ud').value = 0.10;
    } else if (nombre === 'llavero-multicolor') {
        document.getElementById('calc-titulo').value = 'Llavero Multicolor (3 Colores)';
        document.getElementById('calc-piezas-totales').value = 60;
        document.getElementById('calc-g-tirada').value = 35;
        document.getElementById('calc-piezas-tirada').value = 8;
        document.getElementById('calc-colores').value = 3;
        document.getElementById('calc-tiempo-diseno-3d').value = 2.0;
        document.getElementById('calc-incluir-laser').checked = false;
        document.getElementById('calc-incluir-montaje').checked = true;
        document.getElementById('calc-llaveros-ud').value = 0.15;
    } else if (nombre === 'llavero-madera-3d') {
        document.getElementById('calc-titulo').value = 'Llavero 3D + Madera Láser';
        document.getElementById('calc-piezas-totales').value = 75;
        document.getElementById('calc-g-tirada').value = 21;
        document.getElementById('calc-piezas-tirada').value = 15;
        document.getElementById('calc-colores').value = 1;
        document.getElementById('calc-tiempo-diseno-3d').value = 2.0;
        document.getElementById('calc-incluir-laser').checked = true;
        document.getElementById('calc-piezas-tablero').value = 16;
        document.getElementById('calc-incluir-montaje').checked = true;
        document.getElementById('calc-pegar-ud').value = 0.30;
        document.getElementById('calc-llaveros-ud').value = 0.30;
        document.getElementById('calc-fornituras-ud').value = 0.20;
    } else if (nombre === 'portafotos') {
        document.getElementById('calc-titulo').value = 'Portafotos / Decoración';
        document.getElementById('calc-piezas-totales').value = 20;
        document.getElementById('calc-g-tirada').value = 60;
        document.getElementById('calc-piezas-tirada').value = 4;
        document.getElementById('calc-colores').value = 2;
        document.getElementById('calc-tiempo-diseno-3d').value = 2.5;
        document.getElementById('calc-incluir-laser').checked = true;
        document.getElementById('calc-incluir-montaje').checked = true;
    }

    document.getElementById('laser-params-box').classList.toggle('hidden', !document.getElementById('calc-incluir-laser').checked);
    document.getElementById('montaje-params-box').classList.toggle('hidden', !document.getElementById('calc-incluir-montaje').checked);
    ejecutarCalculo();
}

async function ejecutarCalculo() {
    const payload = {
        titulo: document.getElementById('calc-titulo').value || 'Proyecto',
        piezas_totales: parseInt(document.getElementById('calc-piezas-totales').value) || 1,
        incluir_3d: true,
        precio_kg: parseFloat(document.getElementById('calc-precio-kg').value) || 20.0,
        g_por_tirada: parseFloat(document.getElementById('calc-g-tirada').value) || 0.0,
        piezas_por_tirada: parseInt(document.getElementById('calc-piezas-tirada').value) || 1,
        pct_perdidas_3d: parseFloat(document.getElementById('calc-perdidas-3d').value) || 0.10,
        coste_cambio_tirada_3d: parseFloat(document.getElementById('calc-coste-cambio-3d').value) || 2.0,
        tiempo_diseno_3d_h: parseFloat(document.getElementById('calc-tiempo-diseno-3d').value) || 0.0,
        precio_hora_diseno: parseFloat(document.getElementById('calc-precio-hora-diseno').value) || 15.0,
        colores: parseInt(document.getElementById('calc-colores').value) || 1,
        min_por_tirada_3d: parseFloat(document.getElementById('calc-min-tirada-3d').value) || 120.0,
        
        incluir_laser: document.getElementById('calc-incluir-laser').checked,
        precio_m2_madera: parseFloat(document.getElementById('calc-precio-m2-madera').value) || 15.0,
        tablero_largo_cm: parseFloat(document.getElementById('calc-largo-tablero').value) || 30.0,
        tablero_ancho_cm: parseFloat(document.getElementById('calc-ancho-tablero').value) || 30.0,
        piezas_por_tablero: parseInt(document.getElementById('calc-piezas-tablero').value) || 1,
        pct_perdidas_laser: parseFloat(document.getElementById('calc-perdidas-laser').value) || 0.10,
        coste_cambio_tirada_laser: 3.0,
        tiempo_diseno_laser_h: parseFloat(document.getElementById('calc-tiempo-diseno-laser').value) || 0.0,

        incluir_montaje: document.getElementById('calc-incluir-montaje').checked,
        pegar_piezas_ud: parseFloat(document.getElementById('calc-pegar-ud').value) || 0.0,
        poner_llaveros_ud: parseFloat(document.getElementById('calc-llaveros-ud').value) || 0.0,
        material_fornituras_ud: parseFloat(document.getElementById('calc-fornituras-ud').value) || 0.0,
        coste_cola_fijo: parseFloat(document.getElementById('calc-cola-fijo').value) || 0.0,

        descuento_pct: parseFloat(document.getElementById('calc-descuento-pct').value) || 0.0,
        aplicar_iva: document.getElementById('calc-aplicar-iva').checked
    };

    try {
        const res = await fetch('/api/calcular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const r = await res.json();
        renderResultadoCalculo(r);
    } catch (e) {
        console.error('Error calculando:', e);
    }
}

let lastCalculoResultado = null;

function renderResultadoCalculo(r) {
    lastCalculoResultado = r;

    // Headline Results
    document.getElementById('res-precio-ud').innerText = `${r.precio_unitario_final_con_iva.toFixed(2)} €`;
    document.getElementById('res-precio-total').innerText = `${r.precio_final_con_iva.toFixed(2)} €`;
    
    document.getElementById('res-base-total').innerText = `${r.precio_base_total.toFixed(2)} €`;
    document.getElementById('res-descuento-val').innerText = `-${r.descuento_importe.toFixed(2)} € (${(r.descuento_pct * 100).toFixed(0)}%)`;
    document.getElementById('res-iva-val').innerText = r.aplicar_iva ? `+${r.iva_importe.toFixed(2)} € (21%)` : 'No aplicado';

    // Safety Floor Minimum Price
    document.getElementById('res-min-suelo-total').innerText = `${r.precio_minimo_suelo.toFixed(2)} €`;
    document.getElementById('res-min-suelo-ud').innerText = `${r.precio_minimo_unitario.toFixed(2)} €/ud`;
    document.getElementById('res-margen-maniobra').innerText = `${r.margen_sobre_minimo.toFixed(2)} €`;

    // Production Metrics
    document.getElementById('res-tiradas-3d').innerText = `${r.tiradas_3d} tiradas (${r.kg_totales_3d} kg)`;
    document.getElementById('res-tiempo-total').innerText = r.tiempo_formato_str;
    document.getElementById('res-rendimiento-hora').innerText = `${r.rendimiento_eur_hora.toFixed(2)} € / h`;

    // Detailed Breakdown by Module
    if (r.modulo_3d) {
        document.getElementById('detail-3d-box').classList.remove('hidden');
        document.getElementById('det-3d-mat').innerText = `${r.modulo_3d.coste_material_con_perdidas.toFixed(2)} €`;
        document.getElementById('det-3d-tiradas').innerText = `${r.modulo_3d.coste_tiradas.toFixed(2)} €`;
        document.getElementById('det-3d-diseno').innerText = `${r.modulo_3d.coste_diseno.toFixed(2)} €`;
        document.getElementById('det-3d-recargos').innerText = `${(r.modulo_3d.recargo_colores + r.modulo_3d.recargo_tramites + r.modulo_3d.recargo_desgaste_energia).toFixed(2)} €`;
        document.getElementById('det-3d-beneficio').innerText = `${r.modulo_3d.beneficio.toFixed(2)} €`;
        document.getElementById('det-3d-total').innerText = `${r.modulo_3d.coste_total.toFixed(2)} €`;
    } else {
        document.getElementById('detail-3d-box').classList.add('hidden');
    }

    if (r.modulo_laser) {
        document.getElementById('detail-laser-box').classList.remove('hidden');
        document.getElementById('det-laser-tableros').innerText = `${r.tableros_laser} tableros (${r.modulo_laser.coste_material_con_perdidas.toFixed(2)} €)`;
        document.getElementById('det-laser-total').innerText = `${r.modulo_laser.coste_total.toFixed(2)} €`;
    } else {
        document.getElementById('detail-laser-box').classList.add('hidden');
    }

    if (r.modulo_montaje) {
        document.getElementById('detail-montaje-box').classList.remove('hidden');
        document.getElementById('det-montaje-total').innerText = `${r.modulo_montaje.coste_total.toFixed(2)} €`;
    } else {
        document.getElementById('detail-montaje-box').classList.add('hidden');
    }
}

// --- GESTIÓN DE COLORES Y FILAMENTOS EN CALCULADORA ---
let calcColoresFilamentos = [];
let currentPedidoMaterialesConsumo = [];

function agregarFilaColorCalculadora(stockId = null, gramos = 10.0) {
    if (!stockData || stockData.length === 0) {
        alert('Cargando catálogo de filamentos... Por favor, inténtalo de nuevo en un segundo.');
        return;
    }
    const defaultStockId = stockId || stockData[0].id;
    const newId = 'col_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    calcColoresFilamentos.push({
        id: newId,
        stock_id: parseInt(defaultStockId),
        gramos_tirada: parseFloat(gramos) || 10.0
    });
    renderFilasColorCalculadora();
    actualizarCalculosColores();
}

function eliminarFilaColorCalculadora(rowId) {
    calcColoresFilamentos = calcColoresFilamentos.filter(r => r.id !== rowId);
    renderFilasColorCalculadora();
    actualizarCalculosColores();
}

function cambiarMaterialFilaColor(rowId, nuevoStockId) {
    const row = calcColoresFilamentos.find(r => r.id === rowId);
    if (!row) return;
    row.stock_id = parseInt(nuevoStockId);
    actualizarCalculosColores();
}

function cambiarGramosFilaColor(rowId, nuevosGramos) {
    const row = calcColoresFilamentos.find(r => r.id === rowId);
    if (!row) return;
    row.gramos_tirada = parseFloat(nuevosGramos) || 0.0;
    actualizarCalculosColores(false);
}

function renderFilasColorCalculadora() {
    const container = document.getElementById('calc-colores-lista');
    const resumen = document.getElementById('calc-colores-resumen');
    if (!container) return;

    container.innerHTML = '';

    if (calcColoresFilamentos.length === 0) {
        if (resumen) resumen.classList.add('hidden');
        return;
    }

    if (resumen) resumen.classList.remove('hidden');

    const piezasTotales = parseInt(document.getElementById('calc-piezas-totales')?.value) || 1;
    const piezasTirada = parseInt(document.getElementById('calc-piezas-tirada')?.value) || 1;
    const tiradas = Math.max(1, Math.ceil(piezasTotales / piezasTirada));

    calcColoresFilamentos.forEach((item) => {
        const mat = stockData.find(s => s.id === item.stock_id) || stockData[0] || {};
        const totalG = (parseFloat(item.gramos_tirada) || 0) * tiradas;
        const disponible = mat.stock_total_g || 0;
        const restante = disponible - totalG;
        const suficiente = restante >= 0;
        const colorHex = mat.color_hex || '#64748b';

        const rowEl = document.createElement('div');
        rowEl.id = `fila-${item.id}`;
        rowEl.className = 'p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col md:flex-row items-stretch md:items-center gap-2.5 text-xs transition-all';

        rowEl.innerHTML = `
            <div class="flex items-center gap-2 flex-1 min-w-[200px]">
                <span class="w-4 h-4 rounded-full border border-white/20 flex-shrink-0 shadow-sm" style="background-color: ${colorHex};" id="swatch-${item.id}"></span>
                <select onchange="cambiarMaterialFilaColor('${item.id}', this.value)" class="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-white font-medium focus:ring-1 focus:ring-purple-500 select-material-row">
                    ${stockData.map(s => `
                        <option value="${s.id}" ${s.id === item.stock_id ? 'selected' : ''}>
                            ${s.tipo} - ${s.color} (Stock: ${s.stock_total_g.toFixed(0)}g | ${s.precio_kg_estimado}€/kg)
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="flex items-center justify-between md:justify-end gap-3 flex-wrap">
                <div class="flex items-center gap-1.5">
                    <span class="text-slate-400 text-[11px]">Gramos/cama:</span>
                    <input type="number" step="0.1" min="0" value="${item.gramos_tirada}" oninput="cambiarGramosFilaColor('${item.id}', this.value)" class="w-20 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-white font-mono text-right focus:ring-1 focus:ring-purple-500">
                    <span class="text-slate-400 font-mono text-xs">g</span>
                </div>
                <div class="flex items-center gap-2 font-mono text-[11px]">
                    <span class="px-2 py-0.5 rounded-md bg-slate-800 text-purple-300 font-bold border border-slate-700/60" id="badge-total-${item.id}" title="Gramos totales para ${tiradas} tiradas">
                        Total: ${totalG.toFixed(1)}g
                    </span>
                    <span class="px-2 py-0.5 rounded-md font-semibold ${suficiente ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' : 'bg-red-950/70 text-red-300 border border-red-800/60'}" id="badge-stock-${item.id}">
                        ${suficiente ? `Quedan ${restante.toFixed(0)}g` : `⚠️ Falta (${Math.abs(restante).toFixed(0)}g)`}
                    </span>
                </div>
                <button type="button" onclick="eliminarFilaColorCalculadora('${item.id}')" class="text-slate-400 hover:text-red-400 px-2 py-1 bg-slate-800/60 hover:bg-red-950/40 rounded-lg border border-slate-700/60 transition-colors" title="Eliminar este color">
                    🗑️
                </button>
            </div>
        `;
        container.appendChild(rowEl);
    });
}

function actualizarCalculosColores(rebuildDOM = false) {
    if (rebuildDOM) {
        renderFilasColorCalculadora();
    }

    const container = document.getElementById('calc-colores-lista');
    const resumen = document.getElementById('calc-colores-resumen');
    if (!container) return;

    if (calcColoresFilamentos.length === 0) {
        if (resumen) resumen.classList.add('hidden');
        return;
    }

    if (resumen) resumen.classList.remove('hidden');

    const piezasTotales = parseInt(document.getElementById('calc-piezas-totales')?.value) || 1;
    const piezasTirada = parseInt(document.getElementById('calc-piezas-tirada')?.value) || 1;
    const tiradas = Math.max(1, Math.ceil(piezasTotales / piezasTirada));

    let sumaGramosTirada = 0;
    let sumaCosteMaterialTirada = 0;
    let coloresActivos = 0;

    calcColoresFilamentos.forEach(item => {
        const mat = stockData.find(s => s.id === item.stock_id) || stockData[0] || {};
        const gTirada = parseFloat(item.gramos_tirada) || 0.0;
        const totalG = gTirada * tiradas;
        const disponible = mat.stock_total_g || 0;
        const restante = disponible - totalG;
        const suficiente = restante >= 0;

        sumaGramosTirada += gTirada;
        if (gTirada > 0) coloresActivos++;
        const precioKg = mat.precio_kg_estimado || 20.0;
        sumaCosteMaterialTirada += gTirada * precioKg;

        const swatch = document.getElementById(`swatch-${item.id}`);
        if (swatch) swatch.style.backgroundColor = mat.color_hex || '#64748b';

        const badgeTotal = document.getElementById(`badge-total-${item.id}`);
        if (badgeTotal) badgeTotal.innerText = `Total: ${totalG.toFixed(1)}g`;

        const badgeStock = document.getElementById(`badge-stock-${item.id}`);
        if (badgeStock) {
            badgeStock.innerText = suficiente ? `Quedan ${restante.toFixed(0)}g` : `⚠️ Falta (${Math.abs(restante).toFixed(0)}g)`;
            badgeStock.className = `px-2 py-0.5 rounded-md font-semibold ${suficiente ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' : 'bg-red-950/70 text-red-300 border border-red-800/60'}`;
        }
    });

    const precioMedioKg = sumaGramosTirada > 0 ? (sumaCosteMaterialTirada / sumaGramosTirada) : 20.0;
    const totalEncargoG = sumaGramosTirada * tiradas;

    const gTiradaInput = document.getElementById('calc-g-tirada');
    if (gTiradaInput) gTiradaInput.value = sumaGramosTirada.toFixed(1);

    const coloresInput = document.getElementById('calc-colores');
    if (coloresInput) coloresInput.value = Math.max(1, coloresActivos || calcColoresFilamentos.length);

    const precioKgInput = document.getElementById('calc-precio-kg');
    if (precioKgInput) precioKgInput.value = precioMedioKg.toFixed(2);

    const sumGEl = document.getElementById('calc-colores-sum-g-tirada');
    if (sumGEl) sumGEl.innerText = `${sumaGramosTirada.toFixed(1)} g`;

    const sumTotalEl = document.getElementById('calc-colores-sum-g-total');
    if (sumTotalEl) sumTotalEl.innerText = `${totalEncargoG.toFixed(1)} g`;

    const avgPrecioEl = document.getElementById('calc-colores-avg-precio');
    if (avgPrecioEl) avgPrecioEl.innerText = `${precioMedioKg.toFixed(2)} €/kg`;

    guardarDraftCalculadora();
    ejecutarCalculo();
}

function actualizarSelectsFilamentosCalculadora() {
    calcColoresFilamentos.forEach(item => {
        const rowEl = document.getElementById(`fila-${item.id}`);
        if (!rowEl) return;
        const sel = rowEl.querySelector('.select-material-row');
        if (!sel) return;
        const currentVal = item.stock_id;
        sel.innerHTML = stockData.map(s => `
            <option value="${s.id}" ${s.id === currentVal ? 'selected' : ''}>
                ${s.tipo} - ${s.color} (Stock: ${s.stock_total_g.toFixed(0)}g | ${s.precio_kg_estimado}€/kg)
            </option>
        `).join('');
    });
    actualizarCalculosColores();
}

async function descontarStockDirectoCalculadora() {
    if (calcColoresFilamentos.length === 0) {
        alert('Añade al menos un filamento o color para descontar del stock.');
        return;
    }

    const piezasTotales = parseInt(document.getElementById('calc-piezas-totales')?.value) || 1;
    const piezasTirada = parseInt(document.getElementById('calc-piezas-tirada')?.value) || 1;
    const tiradas = Math.max(1, Math.ceil(piezasTotales / piezasTirada));

    const items = calcColoresFilamentos.map(it => {
        const mat = stockData.find(s => s.id === it.stock_id);
        const gramosTotal = (parseFloat(it.gramos_tirada) || 0) * tiradas;
        return {
            stock_id: it.stock_id,
            nombre: mat ? `${mat.tipo} ${mat.color}` : 'Filamento',
            gramos: gramosTotal
        };
    }).filter(x => x.gramos > 0);

    if (items.length === 0) {
        alert('Los gramos a descontar deben ser mayores a 0.');
        return;
    }

    const resumenTexto = items.map(x => `• ${x.nombre}: ${x.gramos.toFixed(1)} g`).join('\n');
    const respSocio = prompt(`¿Quién realiza la impresión para descontar de su stock?\nEscribe:\n- P para Pablo\n- J para Javi\n- W para Ambos/Taller\n\nConsumos calculados (${tiradas} tiradas, ${piezasTotales} piezas):\n${resumenTexto}`, 'J');

    if (!respSocio) return;
    const socio = respSocio.trim().toUpperCase();
    if (!['P', 'J', 'W'].includes(socio)) {
        alert('Por favor indica P (Pablo), J (Javi) o W (Ambos/Taller).');
        return;
    }

    try {
        const res = await fetch('/api/stock/descontar-lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: items,
                socio: socio
            })
        });

        if (!res.ok) {
            alert('Error al descontar el stock.');
            return;
        }

        await loadStock();
        await loadBalance();
        actualizarCalculosColores();
        const quienNombre = socio === 'P' ? 'Pablo' : (socio === 'J' ? 'Javi' : 'Ambos');
        mostrarNotificacion(`✅ Stock descontado correctamente a nombre de ${quienNombre}.`);
    } catch (e) {
        console.error('Error al descontar stock:', e);
        alert('Error de conexión al descontar stock.');
    }
}

function renderModalPedidoConsumoMateriales() {
    const container = document.getElementById('pedido-consumo-materiales-container');
    const lista = document.getElementById('pedido-consumo-materiales-lista');
    if (!container || !lista) return;

    if (!currentPedidoMaterialesConsumo || currentPedidoMaterialesConsumo.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    lista.innerHTML = '';

    currentPedidoMaterialesConsumo.forEach(m => {
        const despues = Math.max(0, m.stock_actual_g - m.gramos);
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0';
        row.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full border border-slate-600 flex-shrink-0" style="background-color: ${m.color_hex};"></span>
                <span class="font-medium text-white">${m.tipo} - ${m.color}</span>
            </div>
            <div class="flex items-center gap-2 font-mono">
                <span class="text-amber-400 font-bold">-${m.gramos.toFixed(1)} g</span>
                <span class="text-slate-400 text-[11px]">(${m.stock_actual_g.toFixed(0)}g ➔ ${despues.toFixed(0)}g)</span>
            </div>
        `;
        lista.appendChild(row);
    });
}

// Convert calculation to new order
function crearPedidoDesdeCalculo() {
    if (!lastCalculoResultado) return;
    const titulo = document.getElementById('calc-titulo').value || 'Nuevo Proyecto';
    const piezas = parseInt(document.getElementById('calc-piezas-totales').value) || 1;
    const precioUd = lastCalculoResultado.precio_unitario_final_con_iva;
    const precioTotal = lastCalculoResultado.precio_final_con_iva;

    // Open Modal
    document.getElementById('modal-pedido-title').innerText = 'Guardar Presupuesto como Pedido';
    document.getElementById('form-pedido-id').value = '';
    document.getElementById('form-pedido-titulo').value = titulo;
    document.getElementById('form-pedido-cliente').value = 'Particular';
    document.getElementById('form-pedido-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('form-pedido-unidades').value = piezas;
    document.getElementById('form-pedido-precio-ud').value = precioUd.toFixed(2);
    document.getElementById('form-pedido-precio-total').value = precioTotal.toFixed(2);
    document.getElementById('form-pedido-hace').value = 'J';
    document.getElementById('form-pedido-cobra').value = 'X';
    document.getElementById('form-pedido-notas').value = `Generado desde Calculadora. Tiradas: ${lastCalculoResultado.tiradas_3d}. Tiempo est: ${lastCalculoResultado.tiempo_formato_str}.`;

    // Process filament color consumption
    const piezasTirada = parseInt(document.getElementById('calc-piezas-tirada')?.value) || 1;
    const tiradas = Math.max(1, Math.ceil(piezas / piezasTirada));

    if (calcColoresFilamentos && calcColoresFilamentos.length > 0) {
        currentPedidoMaterialesConsumo = calcColoresFilamentos.map(it => {
            const mat = stockData.find(s => s.id === it.stock_id);
            const gTotal = (parseFloat(it.gramos_tirada) || 0) * tiradas;
            return {
                stock_id: it.stock_id,
                tipo: mat ? mat.tipo : 'PLA',
                color: mat ? mat.color : 'Color',
                color_hex: mat ? mat.color_hex : '#64748b',
                stock_actual_g: mat ? mat.stock_total_g : 0,
                gramos: gTotal
            };
        }).filter(m => m.gramos > 0);
    } else {
        currentPedidoMaterialesConsumo = [];
    }

    renderModalPedidoConsumoMateriales();
    abrirModalPedido();
}

function copiarPresupuestoWhatsApp() {
    if (!lastCalculoResultado) return;
    const titulo = document.getElementById('calc-titulo').value || 'Proyecto 3D';
    const piezas = document.getElementById('calc-piezas-totales').value;
    const precioUd = lastCalculoResultado.precio_unitario_final_con_iva.toFixed(2);
    const precioTotal = lastCalculoResultado.precio_final_con_iva.toFixed(2);
    const tiempo = lastCalculoResultado.tiempo_formato_str;

    const texto = `👋 ¡Hola! Te paso el presupuesto de *W&P* para tu encargo:
📌 *Proyecto:* ${titulo}
🔢 *Cantidad:* ${piezas} uds
💰 *Precio unitario:* ${precioUd} € / ud
🏷️ *Precio Total:* ${precioTotal} €${lastCalculoResultado.aplicar_iva ? ' (IVA incluido)' : ''}
⏱️ *Tiempo estimado de fabricación:* ${tiempo}

¡Cualquier duda o ajuste me dices! 😊`;

    navigator.clipboard.writeText(texto).then(() => {
        mostrarNotificacion('¡Presupuesto copiado al portapapeles listo para enviar por WhatsApp!');
    }).catch(err => {
        console.error('Error al copiar:', err);
    });
}

// --- GESTIÓN DE PEDIDOS ---
async function loadPedidos(filtro = null, query = null) {
    let url = '/api/pedidos';
    const params = [];
    if (filtro) params.push(`filtro=${encodeURIComponent(filtro)}`);
    if (query) params.push(`q=${encodeURIComponent(query)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    try {
        const res = await fetch(url);
        pedidosData = await res.json();
        renderPedidosTable();
    } catch (e) {
        console.error('Error cargando pedidos:', e);
    }
}

function renderPedidosTable() {
    const tbody = document.getElementById('pedidos-table-body');
    tbody.innerHTML = '';

    if (pedidosData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">No se encontraron pedidos.</td></tr>`;
        return;
    }

    pedidosData.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800 hover:bg-slate-800/40 transition-colors text-sm';
        
        let badgeCobraClass = 'badge-pendiente';
        let badgeCobraText = 'Pendiente (X)';
        if (p.quien_cobra === 'J') { badgeCobraClass = 'badge-javi'; badgeCobraText = 'Cobró Javi'; }
        else if (p.quien_cobra === 'P') { badgeCobraClass = 'badge-pablo'; badgeCobraText = 'Cobró Pablo'; }
        else if (p.quien_cobra === 'W') { badgeCobraClass = 'badge-empresa'; badgeCobraText = 'Empresa (W)'; }

        let badgeHaceText = p.quien_hace === 'J' ? 'Javi' : (p.quien_hace === 'P' ? 'Pablo' : 'Ambos (W)');

        tr.innerHTML = `
            <td class="py-3 px-4 font-mono font-bold text-slate-300">#${p.id}</td>
            <td class="py-3 px-4">
                <div class="font-medium text-white">${p.titulo}</div>
                <div class="text-xs text-slate-400">${p.cliente} • <span class="text-slate-500">${p.fecha || ''}</span></div>
            </td>
            <td class="py-3 px-4 text-center font-semibold text-slate-200">${p.unidades}</td>
            <td class="py-3 px-4 text-right text-slate-300">${p.precio_unidad ? p.precio_unidad.toFixed(2) + ' €' : '-'}</td>
            <td class="py-3 px-4 text-right font-bold text-emerald-400">${p.precio_total ? p.precio_total.toFixed(2) + ' €' : '0.00 €'}</td>
            <td class="py-3 px-4 text-center">
                <span class="px-2 py-0.5 rounded text-xs font-semibold ${p.quien_hace === 'J' ? 'text-emerald-400 bg-emerald-950/60' : (p.quien_hace === 'P' ? 'text-blue-400 bg-blue-950/60' : 'text-purple-400 bg-purple-950/60')}">
                    ${badgeHaceText}
                </span>
            </td>
            <td class="py-3 px-4 text-center">
                <button onclick="toggleEstadoCobro('${p.id}', '${p.quien_cobra}')" title="Clic para alternar cobro" class="px-2.5 py-1 rounded-full text-xs font-bold ${badgeCobraClass} hover:opacity-80 transition-opacity">
                    ${badgeCobraText}
                </button>
            </td>
            <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="editarPedidoModal('${p.id}')" class="p-1.5 text-slate-400 hover:text-blue-400 transition-colors" title="Editar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="eliminarPedidoConfirmar('${p.id}')" class="p-1.5 text-slate-400 hover:text-red-400 transition-colors" title="Eliminar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Quick toggle payment status
async function toggleEstadoCobro(id, actual) {
    const orden = ['X', 'J', 'P', 'W'];
    let nextIdx = (orden.indexOf(actual) + 1) % orden.length;
    const nuevo = orden[nextIdx];

    try {
        const pedido = pedidosData.find(p => p.id === id);
        if (!pedido) return;
        pedido.quien_cobra = nuevo;

        await fetch(`/api/pedidos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedido)
        });

        await loadBalance();
        renderPedidosTable();
        mostrarNotificacion(`Pedido #${id} actualizado: ${nuevo === 'X' ? 'Pendiente' : (nuevo === 'J' ? 'Cobró Javi' : (nuevo === 'P' ? 'Cobró Pablo' : 'Empresa'))}`);
    } catch (e) {
        console.error('Error actualizando cobro:', e);
    }
}

async function marcarCobrado(id, socio) {
    try {
        const pedido = pedidosData.find(p => p.id === id);
        if (!pedido) return;
        pedido.quien_cobra = socio;

        await fetch(`/api/pedidos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedido)
        });

        await loadBalance();
        await loadPedidos();
        mostrarNotificacion(`¡Cobro registrado a favor de ${socio === 'J' ? 'Javi' : 'Pablo'}!`);
    } catch (e) {
        console.error('Error:', e);
    }
}

// Modals Pedido
function abrirModalNuevoPedido() {
    currentPedidoMaterialesConsumo = [];
    renderModalPedidoConsumoMateriales();
    document.getElementById('modal-pedido-title').innerText = 'Registrar Nuevo Pedido';
    document.getElementById('form-pedido-id').value = '';
    document.getElementById('form-pedido-titulo').value = '';
    document.getElementById('form-pedido-cliente').value = '';
    document.getElementById('form-pedido-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('form-pedido-unidades').value = '1';
    document.getElementById('form-pedido-precio-ud').value = '0.00';
    document.getElementById('form-pedido-precio-total').value = '0.00';
    document.getElementById('form-pedido-hace').value = 'J';
    document.getElementById('form-pedido-cobra').value = 'X';
    document.getElementById('form-pedido-notas').value = '';
    abrirModalPedido();
}

function editarPedidoModal(id) {
    currentPedidoMaterialesConsumo = [];
    renderModalPedidoConsumoMateriales();
    const p = pedidosData.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-pedido-title').innerText = `Editar Pedido #${p.id}`;
    document.getElementById('form-pedido-id').value = p.id;
    document.getElementById('form-pedido-titulo').value = p.titulo;
    document.getElementById('form-pedido-cliente').value = p.cliente;
    document.getElementById('form-pedido-fecha').value = p.fecha || '';
    document.getElementById('form-pedido-unidades').value = p.unidades;
    document.getElementById('form-pedido-precio-ud').value = p.precio_unidad;
    document.getElementById('form-pedido-precio-total').value = p.precio_total;
    document.getElementById('form-pedido-hace').value = p.quien_hace || 'J';
    document.getElementById('form-pedido-cobra').value = p.quien_cobra || 'X';
    document.getElementById('form-pedido-notas').value = p.notas || '';
    abrirModalPedido();
}

function abrirModalPedido() {
    document.getElementById('modal-pedido').classList.remove('hidden');
}

function cerrarModalPedido() {
    document.getElementById('modal-pedido').classList.add('hidden');
}

async function guardarPedido(e) {
    e.preventDefault();
    const pid = document.getElementById('form-pedido-id').value;
    const uds = parseFloat(document.getElementById('form-pedido-unidades').value) || 1;
    const precioUd = parseFloat(document.getElementById('form-pedido-precio-ud').value) || 0;
    const precioTotal = parseFloat(document.getElementById('form-pedido-precio-total').value) || (uds * precioUd);
    const cliente = (document.getElementById('form-pedido-cliente').value || '').trim() || 'Particular';
    const fecha = document.getElementById('form-pedido-fecha').value || new Date().toISOString().split('T')[0];
    const quienHace = document.getElementById('form-pedido-hace').value;

    const autoDescontar = document.getElementById('pedido-auto-descontar-stock')?.checked;
    const tieneMaterialesADescontar = autoDescontar && currentPedidoMaterialesConsumo && currentPedidoMaterialesConsumo.length > 0;

    let detallesObj = {};
    if (tieneMaterialesADescontar) {
        detallesObj = {
            generado_calculadora: true,
            materiales_consumidos: currentPedidoMaterialesConsumo,
            piezas: uds,
            descontado_auto: true,
            fecha_consumo: fecha
        };
    }

    const payload = {
        id: pid,
        titulo: (document.getElementById('form-pedido-titulo').value || '').trim() || 'Nuevo Pedido',
        cliente: cliente,
        fecha: fecha,
        unidades: uds,
        precio_unidad: precioUd,
        precio_total: precioTotal,
        pct_ci: 0.20,
        quien_hace: quienHace,
        quien_cobra: document.getElementById('form-pedido-cobra').value,
        notas: document.getElementById('form-pedido-notas').value,
        detalles_json: tieneMaterialesADescontar ? JSON.stringify(detallesObj) : ''
    };

    try {
        let res;
        let createdId = pid;
        if (pid) {
            // Update
            res = await fetch(`/api/pedidos/${pid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert('Error al actualizar pedido: ' + (err.detail || res.statusText));
                return;
            }
        } else {
            // Create
            res = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert('Error al crear pedido: ' + (err.detail || res.statusText));
                return;
            }
            const created = await res.json();
            createdId = created.id;
        }

        // Auto discount stock if selected
        if (tieneMaterialesADescontar) {
            try {
                await fetch('/api/stock/descontar-lote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        items: currentPedidoMaterialesConsumo,
                        socio: quienHace
                    })
                });
            } catch (descErr) {
                console.error('Error al descontar stock en lote:', descErr);
            }
        }

        currentPedidoMaterialesConsumo = [];
        cerrarModalPedido();
        await loadStock();
        await loadBalance();
        await loadPedidos();
        actualizarCalculosColores();

        if (tieneMaterialesADescontar) {
            mostrarNotificacion(`✅ Pedido #${createdId} guardado y filamentos descontados del stock.`);
        } else {
            mostrarNotificacion(`Pedido #${createdId} guardado con éxito.`);
        }

        switchTab('pedidos');
    } catch (err) {
        console.error('Error guardando pedido:', err);
        alert('Error de conexión al guardar el pedido. Comprueba la conexión o el servidor.');
    }
}

async function eliminarPedidoConfirmar(id) {
    if (confirm(`¿Estás seguro de que deseas eliminar el pedido #${id}?`)) {
        try {
            await fetch(`/api/pedidos/${id}`, { method: 'DELETE' });
            await loadBalance();
            await loadPedidos();
            mostrarNotificacion(`Pedido #${id} eliminado.`);
        } catch (e) {
            console.error('Error eliminando pedido:', e);
        }
    }
}

// Search and filters
document.getElementById('search-pedidos')?.addEventListener('input', (e) => {
    loadPedidos(null, e.target.value);
});

function filtrarPedidos(estado) {
    document.querySelectorAll('.filter-pedidos-btn').forEach(b => {
        if (b.getAttribute('data-filter') === estado) {
            b.classList.add('bg-slate-700', 'text-white');
            b.classList.remove('text-slate-400');
        } else {
            b.classList.remove('bg-slate-700', 'text-white');
            b.classList.add('text-slate-400');
        }
    });
    loadPedidos(estado === 'TODOS' ? null : estado);
}

// --- STOCK Y MATERIALES ---
async function loadStock() {
    try {
        const res = await fetch('/api/stock');
        stockData = await res.json();
        renderStockCards();
        populateCalculatorMaterialDropdown();
        actualizarSelectsFilamentosCalculadora();
    } catch (e) {
        console.error('Error cargando stock:', e);
    }
}

function renderStockCards() {
    const container = document.getElementById('stock-filamentos-grid');
    container.innerHTML = '';

    stockData.forEach(s => {
        const isLow = s.stock_total_g < s.alerta_minimo_g;
        const ubicacionActual = s.ubicacion || 'Taller';
        const card = document.createElement('div');
        card.className = `glass-card p-4 rounded-xl border ${isLow ? 'border-red-500/50 bg-red-950/10' : 'border-slate-800'} relative flex flex-col justify-between`;

        const getSelectColor = (u) => {
            if (u === 'Pablo') return 'text-blue-400 border-blue-700/50 bg-blue-950/40';
            if (u === 'Javi') return 'text-emerald-400 border-emerald-700/50 bg-emerald-950/40';
            if (u === 'Ambos') return 'text-amber-400 border-amber-700/50 bg-amber-950/40';
            return 'text-purple-300 border-purple-700/50 bg-purple-950/40';
        };

        card.innerHTML = `
            <div>
                <div class="flex items-start justify-between mb-2.5">
                    <div class="flex items-center gap-2.5">
                        <span class="w-5 h-5 rounded-full border border-white/20 shadow-sm flex-shrink-0" style="background-color: ${s.color_hex}"></span>
                        <div>
                            <h4 class="font-bold text-white text-base leading-tight">${s.color}</h4>
                            <span class="text-xs text-slate-400 font-mono">${s.tipo}</span>
                        </div>
                    </div>
                    ${isLow ? '<span class="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-bold animate-pulse">¡Stock Bajo!</span>' : ''}
                </div>

                <!-- Barra de disponibilidad -->
                <div class="my-2.5">
                    <div class="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Disponible Total</span>
                        <span class="font-bold font-mono text-slate-200">${s.stock_total_g.toFixed(0)} g</span>
                    </div>
                    <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div class="h-full ${isLow ? 'bg-red-500' : 'bg-blue-500'}" style="width: ${Math.min(100, (s.stock_total_g / 1000) * 100)}%"></div>
                    </div>
                </div>

                <!-- Apartado: ¿Quién lo tiene? (Custodia) -->
                <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 my-2.5 flex items-center justify-between text-xs">
                    <span class="text-slate-300 font-medium flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Lo tiene:
                    </span>
                    <select onchange="cambiarCustodiaStock(${s.id}, this.value)" class="text-xs font-bold rounded px-2 py-1 border focus:outline-none cursor-pointer transition-all ${getSelectColor(ubicacionActual)}">
                        <option value="Pablo" ${ubicacionActual === 'Pablo' ? 'selected' : ''}>👤 Pablo</option>
                        <option value="Javi" ${ubicacionActual === 'Javi' ? 'selected' : ''}>👤 Javi</option>
                        <option value="Taller" ${ubicacionActual === 'Taller' ? 'selected' : ''}>🏢 Taller</option>
                        <option value="Ambos" ${ubicacionActual === 'Ambos' ? 'selected' : ''}>🤝 Ambos</option>
                    </select>
                </div>

                <!-- Reparto gramos Pablo / Javi -->
                <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div class="bg-blue-950/30 border border-blue-900/40 p-2 rounded">
                        <span class="text-blue-400 font-semibold block">Pablo</span>
                        <span class="text-white font-mono text-sm">${s.pablo_g.toFixed(0)} g</span>
                    </div>
                    <div class="bg-emerald-950/30 border border-emerald-900/40 p-2 rounded">
                        <span class="text-emerald-400 font-semibold block">Javi</span>
                        <span class="text-white font-mono text-sm">${s.javi_g.toFixed(0)} g</span>
                    </div>
                </div>
            </div>

            <!-- Botones de Acción -->
            <div class="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-slate-800/60">
                <button onclick="ajustarGramosRapido(${s.id}, 100, 'P')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded text-xs font-mono" title="Añadir 100g a Pablo">+100 P</button>
                <button onclick="ajustarGramosRapido(${s.id}, 100, 'J')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded text-xs font-mono" title="Añadir 100g a Javi">+100 J</button>
                <button onclick="abrirEditarStockModal(${s.id})" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs ml-1" title="Ajustar">Editar</button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function cambiarCustodiaStock(id, nuevaUbicacion) {
    const mat = stockData.find(x => x.id === id);
    if (!mat) return;
    mat.ubicacion = nuevaUbicacion;

    try {
        await fetch(`/api/stock/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mat)
        });
        await loadStock();
        mostrarNotificacion(`📍 ${mat.color}: Ahora lo tiene ${nuevaUbicacion}`);
    } catch (e) {
        console.error('Error actualizando custodia de stock:', e);
    }
}

function populateCalculatorMaterialDropdown() {
    const sel = document.getElementById('calc-material-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Introducir precio manual --</option>';
    stockData.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.precio_kg_estimado;
        opt.innerText = `${s.tipo} ${s.color} (${s.stock_total_g.toFixed(0)}g en stock) - ${s.precio_kg_estimado}€/kg`;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', (e) => {
        if (e.target.value) {
            document.getElementById('calc-precio-kg').value = e.target.value;
            ejecutarCalculo();
        }
    });
}

async function ajustarGramosRapido(id, delta, socio) {
    const mat = stockData.find(x => x.id === id);
    if (!mat) return;
    if (socio === 'P') mat.pablo_g = Math.max(0, mat.pablo_g + delta);
    else if (socio === 'J') mat.javi_g = Math.max(0, mat.javi_g + delta);

    try {
        await fetch(`/api/stock/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mat)
        });
        await loadStock();
        mostrarNotificacion(`Stock de ${mat.color} actualizado (+${delta}g para ${socio === 'P' ? 'Pablo' : 'Javi'}).`);
    } catch (e) {
        console.error('Error:', e);
    }
}

// Modal Nuevo Filamento
function abrirModalNuevoFilamento() {
    document.getElementById('modal-stock-title').innerText = '+ Añadir Nuevo Filamento / Color';
    document.getElementById('form-stock-id').value = '';
    document.getElementById('form-stock-tipo').value = 'PLA';
    document.getElementById('form-stock-color').value = '';
    document.getElementById('form-stock-hex').value = '#3b82f6';
    document.getElementById('form-stock-pablo').value = '1000';
    document.getElementById('form-stock-javi').value = '0';
    document.getElementById('form-stock-precio').value = '20';
    document.getElementById('form-stock-alerta').value = '200';
    document.getElementById('form-stock-ubicacion').value = 'Taller';
    document.getElementById('btn-guardar-stock-text').innerText = 'Añadir al Stock';
    const btnEliminar = document.getElementById('btn-eliminar-stock');
    if (btnEliminar) btnEliminar.classList.add('hidden');
    document.getElementById('modal-stock').classList.remove('hidden');
}

// Modal Editar Stock
function abrirEditarStockModal(id) {
    const s = stockData.find(x => x.id === id);
    if (!s) return;
    document.getElementById('modal-stock-title').innerText = `Ajustar Bobina: ${s.tipo} ${s.color}`;
    document.getElementById('form-stock-id').value = s.id;
    document.getElementById('form-stock-tipo').value = s.tipo || 'PLA';
    document.getElementById('form-stock-color').value = s.color || '';
    document.getElementById('form-stock-hex').value = s.color_hex || '#3b82f6';
    document.getElementById('form-stock-pablo').value = s.pablo_g ?? 0;
    document.getElementById('form-stock-javi').value = s.javi_g ?? 0;
    document.getElementById('form-stock-precio').value = s.precio_kg_estimado ?? 20;
    document.getElementById('form-stock-alerta').value = s.alerta_minimo_g ?? 200;
    document.getElementById('form-stock-ubicacion').value = s.ubicacion || 'Taller';
    document.getElementById('btn-guardar-stock-text').innerText = 'Guardar Cambios';
    const btnEliminar = document.getElementById('btn-eliminar-stock');
    if (btnEliminar) btnEliminar.classList.remove('hidden');
    document.getElementById('modal-stock').classList.remove('hidden');
}

function cerrarModalStock() {
    document.getElementById('modal-stock').classList.add('hidden');
}

async function guardarStockModal(e) {
    e.preventDefault();
    const idVal = document.getElementById('form-stock-id').value;
    const sid = idVal ? parseInt(idVal) : null;
    
    const payload = {
        tipo: (document.getElementById('form-stock-tipo').value || 'PLA').trim().toUpperCase(),
        color: (document.getElementById('form-stock-color').value || 'Sin color').trim(),
        color_hex: document.getElementById('form-stock-hex').value || '#64748b',
        pablo_g: parseFloat(document.getElementById('form-stock-pablo').value) || 0,
        javi_g: parseFloat(document.getElementById('form-stock-javi').value) || 0,
        precio_kg_estimado: parseFloat(document.getElementById('form-stock-precio').value) || 20,
        alerta_minimo_g: parseFloat(document.getElementById('form-stock-alerta').value) || 200,
        ubicacion: (document.getElementById('form-stock-ubicacion').value || 'Taller').trim()
    };

    try {
        let res;
        if (sid) {
            // Edit existing
            res = await fetch(`/api/stock/${sid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Error al actualizar material');
            mostrarNotificacion(`Filamento ${payload.color} actualizado.`);
        } else {
            // Create new
            res = await fetch('/api/stock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Error al añadir material');
            mostrarNotificacion(`¡Nuevo filamento ${payload.color} (${payload.tipo}) añadido al inventario!`);
        }

        cerrarModalStock();
        await loadStock();
    } catch (err) {
        console.error('Error guardando stock:', err);
        alert('Error al guardar el material. Comprueba los datos o la conexión.');
    }
}

async function eliminarStockActualModal() {
    const idVal = document.getElementById('form-stock-id').value;
    if (!idVal) return;
    const sid = parseInt(idVal);
    const color = document.getElementById('form-stock-color').value || 'este material';

    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente el filamento "${color}" del stock?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/stock/${sid}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        cerrarModalStock();
        await loadStock();
        mostrarNotificacion(`Filamento "${color}" eliminado.`);
    } catch (e) {
        console.error('Error eliminando material:', e);
        alert('Error al eliminar el material.');
    }
}

// --- FORNITURAS Y OBJETOS ---
async function loadFornituras() {
    try {
        const res = await fetch('/api/fornituras');
        forniturasData = await res.json();
        renderFornituras();
    } catch (e) {
        console.error('Error cargando fornituras:', e);
    }
}

function renderFornituras() {
    const container = document.getElementById('fornituras-container');
    container.innerHTML = '';

    const getUbiColor = (u) => {
        if (u === 'Pablo') return 'text-blue-400 border-blue-700/50 bg-blue-950/40';
        if (u === 'Javi') return 'text-emerald-400 border-emerald-700/50 bg-emerald-950/40';
        if (u === 'Ambos') return 'text-amber-400 border-amber-700/50 bg-amber-950/40';
        return 'text-purple-300 border-purple-700/50 bg-purple-950/40';
    };

    forniturasData.forEach(f => {
        const u = f.ubicacion || 'Taller';
        const div = document.createElement('div');
        div.className = 'glass-card p-4 rounded-xl border border-slate-700/60 flex flex-col justify-between space-y-3';
        div.innerHTML = `
            <div>
                <div class="flex items-start justify-between">
                    <div>
                        <h5 class="font-bold text-white text-sm leading-tight">${f.nombre}</h5>
                        <span class="text-xs text-slate-400">Stock: <strong class="text-emerald-400 font-mono text-base">${f.cantidad}</strong> ${f.unidades || 'ud'}</span>
                    </div>
                    <button onclick="abrirEditarFornituraModal(${f.id})" class="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors" title="Editar objeto">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                </div>

                <!-- Apartado: ¿Quién lo tiene? -->
                <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 mt-2.5 flex items-center justify-between text-xs">
                    <span class="text-slate-300 font-medium flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        Lo tiene:
                    </span>
                    <select onchange="cambiarCustodiaFornitura(${f.id}, this.value)" class="text-xs font-bold rounded px-2 py-1 border focus:outline-none cursor-pointer transition-all ${getUbiColor(u)}">
                        <option value="Pablo" ${u === 'Pablo' ? 'selected' : ''}>👤 Pablo</option>
                        <option value="Javi" ${u === 'Javi' ? 'selected' : ''}>👤 Javi</option>
                        <option value="Taller" ${u === 'Taller' ? 'selected' : ''}>🏢 Taller</option>
                        <option value="Ambos" ${u === 'Ambos' ? 'selected' : ''}>🤝 Ambos</option>
                    </select>
                </div>
            </div>

            <!-- Botones de incremento / decremento rápido -->
            <div class="flex items-center justify-between gap-1 pt-2 border-t border-slate-800">
                <span class="text-[11px] text-slate-500 font-mono">${(f.coste_unitario || 0).toFixed(2)}€/ud</span>
                <div class="flex items-center gap-1">
                    <button onclick="ajustarFornitura(${f.id}, -10)" class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs" title="Restar 10">-10</button>
                    <button onclick="ajustarFornitura(${f.id}, 10)" class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs" title="Sumar 10">+10</button>
                    <button onclick="ajustarFornitura(${f.id}, 50)" class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs" title="Sumar 50">+50</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

async function cambiarCustodiaFornitura(id, nuevaUbicacion) {
    const f = forniturasData.find(x => x.id === id);
    if (!f) return;
    try {
        await fetch(`/api/fornituras/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ubicacion: nuevaUbicacion })
        });
        await loadFornituras();
        mostrarNotificacion(`📍 ${f.nombre}: Ahora lo tiene ${nuevaUbicacion}`);
    } catch (e) {
        console.error('Error custodia fornitura:', e);
    }
}

function abrirModalNuevaFornitura() {
    document.getElementById('modal-fornitura-title').innerText = '+ Añadir Nuevo Objeto / Fornitura';
    document.getElementById('form-fornitura-id').value = '';
    document.getElementById('form-fornitura-nombre').value = '';
    document.getElementById('form-fornitura-cantidad').value = '100';
    document.getElementById('form-fornitura-unidades').value = 'ud';
    document.getElementById('form-fornitura-coste').value = '0.10';
    document.getElementById('form-fornitura-ubicacion').value = 'Taller';
    document.getElementById('btn-guardar-fornitura-text').innerText = 'Añadir al Stock';
    const btnEliminar = document.getElementById('btn-eliminar-fornitura');
    if (btnEliminar) btnEliminar.classList.add('hidden');
    document.getElementById('modal-fornitura').classList.remove('hidden');
}

function abrirEditarFornituraModal(id) {
    const f = forniturasData.find(x => x.id === id);
    if (!f) return;
    document.getElementById('modal-fornitura-title').innerText = `Editar: ${f.nombre}`;
    document.getElementById('form-fornitura-id').value = f.id;
    document.getElementById('form-fornitura-nombre').value = f.nombre || '';
    document.getElementById('form-fornitura-cantidad').value = f.cantidad ?? 0;
    document.getElementById('form-fornitura-unidades').value = f.unidades || 'ud';
    document.getElementById('form-fornitura-coste').value = f.coste_unitario ?? 0.10;
    document.getElementById('form-fornitura-ubicacion').value = f.ubicacion || 'Taller';
    document.getElementById('btn-guardar-fornitura-text').innerText = 'Guardar Cambios';
    const btnEliminar = document.getElementById('btn-eliminar-fornitura');
    if (btnEliminar) btnEliminar.classList.remove('hidden');
    document.getElementById('modal-fornitura').classList.remove('hidden');
}

function cerrarModalFornitura() {
    document.getElementById('modal-fornitura').classList.add('hidden');
}

async function guardarFornituraModal(e) {
    e.preventDefault();
    const idVal = document.getElementById('form-fornitura-id').value;
    const fid = idVal ? parseInt(idVal) : null;

    const payload = {
        nombre: (document.getElementById('form-fornitura-nombre').value || 'Nuevo Objeto').trim(),
        cantidad: parseFloat(document.getElementById('form-fornitura-cantidad').value) || 0,
        unidades: (document.getElementById('form-fornitura-unidades').value || 'ud').trim(),
        coste_unitario: parseFloat(document.getElementById('form-fornitura-coste').value) || 0.10,
        ubicacion: document.getElementById('form-fornitura-ubicacion').value || 'Taller'
    };

    try {
        if (fid) {
            const res = await fetch(`/api/fornituras/${fid}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Error al actualizar objeto');
            mostrarNotificacion(`Objeto "${payload.nombre}" actualizado.`);
        } else {
            const res = await fetch('/api/fornituras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Error al añadir objeto');
            mostrarNotificacion(`¡Objeto "${payload.nombre}" añadido al inventario!`);
        }
        cerrarModalFornitura();
        await loadFornituras();
    } catch (err) {
        console.error('Error guardando fornitura:', err);
        alert('Error al guardar el objeto.');
    }
}

async function eliminarFornituraActualModal() {
    const idVal = document.getElementById('form-fornitura-id').value;
    if (!idVal) return;
    const fid = parseInt(idVal);
    const nombre = document.getElementById('form-fornitura-nombre').value || 'este objeto';

    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente "${nombre}" de la lista de objetos?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/fornituras/${fid}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        cerrarModalFornitura();
        await loadFornituras();
        mostrarNotificacion(`Objeto "${nombre}" eliminado.`);
    } catch (e) {
        console.error('Error eliminando fornitura:', e);
        alert('Error al eliminar el objeto.');
    }
}

async function ajustarFornitura(id, delta) {
    const f = forniturasData.find(x => x.id === id);
    if (!f) return;
    const nueva = Math.max(0, f.cantidad + delta);
    try {
        await fetch(`/api/fornituras/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cantidad: nueva })
        });
        await loadFornituras();
        mostrarNotificacion(`${f.nombre}: ${nueva} ${f.unidades}`);
    } catch (e) {
        console.error('Error fornitura:', e);
    }
}

// --- GASTOS ---
async function loadGastos() {
    try {
        const [resMat, resMaq] = await Promise.all([
            fetch('/api/gastos/material'),
            fetch('/api/gastos/maquinaria')
        ]);
        const matList = await resMat.json();
        const maqList = await resMaq.json();

        renderGastosMaterialTable(matList);
        renderGastosMaquinariaTable(maqList);
    } catch (e) {
        console.error('Error cargando gastos:', e);
    }
}

function renderGastosMaterialTable(list) {
    const tbody = document.getElementById('gastos-material-tbody');
    tbody.innerHTML = '';
    list.slice(0, 15).forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800 text-xs hover:bg-slate-800/40';
        tr.innerHTML = `
            <td class="py-2 px-3 text-slate-300 font-medium">${m.concepto}</td>
            <td class="py-2 px-3 text-slate-400">${m.fecha || '-'}</td>
            <td class="py-2 px-3 text-right font-bold text-slate-200">${m.precio.toFixed(2)} €</td>
            <td class="py-2 px-3 text-center">
                <span class="px-2 py-0.5 rounded font-bold ${m.pagado_por === 'P' ? 'badge-pablo' : (m.pagado_por === 'J' ? 'badge-javi' : 'badge-empresa')}">
                    ${m.pagado_por === 'P' ? 'Pablo' : (m.pagado_por === 'J' ? 'Javi' : 'Empresa')}
                </span>
            </td>
            <td class="py-2 px-3 text-center">
                ${m.enlace ? `<a href="${m.enlace}" target="_blank" class="text-blue-400 hover:underline">Ver Recibo</a>` : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderGastosMaquinariaTable(list) {
    const tbody = document.getElementById('gastos-maquinaria-tbody');
    tbody.innerHTML = '';
    list.slice(0, 15).forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800 text-xs hover:bg-slate-800/40';
        tr.innerHTML = `
            <td class="py-2 px-3 text-slate-300 font-medium">${m.concepto}</td>
            <td class="py-2 px-3 text-slate-400">${m.fecha || '-'}</td>
            <td class="py-2 px-3 text-right font-bold text-slate-200">${m.precio.toFixed(2)} €</td>
            <td class="py-2 px-3 text-center">
                <span class="px-2 py-0.5 rounded font-bold ${m.pagado_por === 'P' ? 'badge-pablo' : (m.pagado_por === 'J' ? 'badge-javi' : 'badge-empresa')}">
                    ${m.pagado_por === 'P' ? 'Pablo' : (m.pagado_por === 'J' ? 'Javi' : 'Empresa')}
                </span>
            </td>
            <td class="py-2 px-3 text-center">
                ${m.enlace ? `<a href="${m.enlace}" target="_blank" class="text-blue-400 hover:underline">Ver Recibo</a>` : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Modal Nuevo Gasto
function abrirModalGasto() {
    document.getElementById('modal-gasto').classList.remove('hidden');
}

function cerrarModalGasto() {
    document.getElementById('modal-gasto').classList.add('hidden');
}

async function guardarGasto(e) {
    e.preventDefault();
    const tipo = document.getElementById('form-gasto-tipo').value;
    const payload = {
        concepto: document.getElementById('form-gasto-concepto').value,
        fecha: document.getElementById('form-gasto-fecha').value || new Date().toISOString().split('T')[0],
        precio: parseFloat(document.getElementById('form-gasto-precio').value) || 0,
        pagado_por: document.getElementById('form-gasto-pagado').value,
        enlace: document.getElementById('form-gasto-enlace').value
    };

    const endpoint = tipo === 'material' ? '/api/gastos/material' : '/api/gastos/maquinaria';
    try {
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        cerrarModalGasto();
        await loadBalance();
        await loadGastos();
        mostrarNotificacion('Gasto registrado correctamente.');
    } catch (err) {
        console.error('Error registrando gasto:', err);
    }
}

// --- CHART RENDERING ---
function renderBalanceChart() {
    if (!balanceData.ingresos) return;
    const ctx = document.getElementById('balance-chart')?.getContext('2d');
    if (!ctx) return;

    if (balanceChart) {
        balanceChart.destroy();
    }

    balanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Ingresos Cobrados', 'Gastos Material', 'Dinero Neto en Mano'],
            datasets: [
                {
                    label: 'Pablo',
                    data: [
                        balanceData.ingresos.cobrado_pablo,
                        balanceData.gastos_material.pablo,
                        balanceData.liquidacion.dinero_neto_pablo
                    ],
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1
                },
                {
                    label: 'Javi',
                    data: [
                        balanceData.ingresos.cobrado_javi,
                        balanceData.gastos_material.javi,
                        balanceData.liquidacion.dinero_neto_javi
                    ],
                    backgroundColor: 'rgba(34, 197, 94, 0.7)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8' }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

// --- PANEL DE RENTABILIDAD Y ESTADÍSTICAS AVANZADAS ---
function updateEstadisticasUI() {
    if (!estadisticasData) return;
    const k = estadisticasData.kpis || {};

    const ticketEl = document.getElementById('stat-ticket-medio');
    if (ticketEl) ticketEl.innerText = `${(k.ticket_medio || 0).toFixed(2)} €`;

    const piezasEl = document.getElementById('stat-total-piezas');
    if (piezasEl) piezasEl.innerText = `${k.total_piezas_fabricadas || 0} uds`;

    const margenEl = document.getElementById('stat-margen-pct');
    if (margenEl) margenEl.innerText = `${(k.margen_neto_pct || 0).toFixed(1)} %`;

    const valorStockEl = document.getElementById('stat-valor-stock');
    if (valorStockEl) valorStockEl.innerText = `${(k.valor_inventario_eur || 0).toFixed(2)} €`;

    const kgBadgeEl = document.getElementById('stat-kg-totales-badge');
    if (kgBadgeEl) kgBadgeEl.innerText = `${(k.kg_stock_disponible || 0).toFixed(2)} kg en stock`;

    // Ranking Top 5 Pedidos
    const topContainer = document.getElementById('top-pedidos-rentables-list');
    if (topContainer && Array.isArray(estadisticasData.top_pedidos)) {
        topContainer.innerHTML = '';
        const medallas = ['🥇', '🥈', '🥉', '4º', '5º'];
        estadisticasData.top_pedidos.forEach((p, idx) => {
            const card = document.createElement('div');
            card.className = 'p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between space-y-2';
            const socioTag = p.quien_hace === 'P' ? 'Pablo' : (p.quien_hace === 'J' ? 'Javi' : 'Taller');
            const socioColor = p.quien_hace === 'P' ? 'text-blue-400' : (p.quien_hace === 'J' ? 'text-emerald-400' : 'text-purple-400');
            card.innerHTML = `
                <div>
                    <div class="flex items-center justify-between text-xs mb-1">
                        <span class="font-bold text-amber-400">${medallas[idx] || '#' + (idx + 1)} #${p.id}</span>
                        <span class="text-[10px] font-semibold ${socioColor}">${socioTag}</span>
                    </div>
                    <p class="font-bold text-white text-xs truncate" title="${p.titulo}">${p.titulo}</p>
                    <p class="text-[11px] text-slate-400 truncate">${p.cliente} • ${p.unidades} uds</p>
                </div>
                <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                    <span class="text-slate-400">${p.precio_total.toFixed(0)}€</span>
                    <span class="font-bold text-emerald-400">+${p.beneficio.toFixed(2)}€ neto</span>
                </div>
            `;
            topContainer.appendChild(card);
        });
    }

    if (currentTab === 'balance') {
        renderEstadisticasCharts();
    }
}

function renderEstadisticasCharts() {
    if (!estadisticasData) return;

    // 1. Gráfica de Evolución Mensual
    const ctxEvo = document.getElementById('chart-evolucion-mensual')?.getContext('2d');
    if (ctxEvo && Array.isArray(estadisticasData.evolucion_mensual)) {
        if (evolucionMensualChart) evolucionMensualChart.destroy();
        const evo = estadisticasData.evolucion_mensual;
        evolucionMensualChart = new Chart(ctxEvo, {
            type: 'bar',
            data: {
                labels: evo.map(m => m.mes_label),
                datasets: [
                    {
                        label: 'Facturación Total (€)',
                        data: evo.map(m => m.facturacion),
                        backgroundColor: 'rgba(99, 102, 241, 0.65)',
                        borderColor: 'rgb(99, 102, 241)',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Beneficio Neto (€)',
                        data: evo.map(m => m.beneficio),
                        backgroundColor: 'rgba(16, 185, 129, 0.75)',
                        borderColor: 'rgb(16, 185, 129)',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    // 2. Gráfica de Stock por Colores Reales
    const ctxCol = document.getElementById('chart-stock-colores')?.getContext('2d');
    if (ctxCol && Array.isArray(estadisticasData.stock_colores)) {
        if (stockColoresChart) stockColoresChart.destroy();
        const topStock = estadisticasData.stock_colores.slice(0, 10);
        stockColoresChart = new Chart(ctxCol, {
            type: 'bar',
            data: {
                labels: topStock.map(s => s.color),
                datasets: [
                    {
                        label: 'Gramos disponibles (g)',
                        data: topStock.map(s => s.stock_total_g),
                        backgroundColor: topStock.map(s => s.color_hex || '#64748b'),
                        borderColor: 'rgba(255, 255, 255, 0.35)',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { ticks: { color: '#cbd5e1', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }
}

// --- LECTOR AUTOMÁTICO DE ARCHIVOS .3MF / .GCODE (BAMBU STUDIO / ORCASLICER) ---
function handleSlicerDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('slicer-dropzone');
    if (dz) dz.classList.add('border-emerald-400', 'bg-emerald-950/30');
}

function handleSlicerDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dz = document.getElementById('slicer-dropzone');
    if (dz) dz.classList.remove('border-emerald-400', 'bg-emerald-950/30');
}

function handleSlicerDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    handleSlicerDragLeave(e);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        procesarArchivoSlicer(e.dataTransfer.files[0]);
    }
}

function handleSlicerFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
        procesarArchivoSlicer(e.target.files[0]);
        e.target.value = '';
    }
}

async function procesarArchivoSlicer(file) {
    if (!file) return;
    const statusEl = document.getElementById('slicer-parse-status');
    if (statusEl) {
        statusEl.classList.remove('hidden', 'text-red-400');
        statusEl.classList.add('text-emerald-300');
        statusEl.innerText = `⏳ Analizando "${file.name}"...`;
    }

    try {
        const res = await fetch('/api/calculadora/analizar-archivo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'X-Filename': encodeURIComponent(file.name)
            },
            body: file
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || 'No se pudo leer el archivo');
        }

        // Actualizar nombre del proyecto si estaba por defecto
        const tituloEl = document.getElementById('calc-titulo');
        if (tituloEl && data.nombre_proyecto) {
            tituloEl.value = decodeURIComponent(data.nombre_proyecto);
        }

        // Actualizar tiempo de impresión por tirada
        const minEl = document.getElementById('calc-min-tirada-3d');
        if (minEl && data.min_por_tirada_3d > 0) {
            minEl.value = Math.round(data.min_por_tirada_3d);
        }

        // Rellenar automáticamente la lista de colores y filamentos en stock
        if (Array.isArray(data.filamentos) && data.filamentos.length > 0) {
            calcColoresFilamentos = data.filamentos.map((f, idx) => ({
                id: 'col_' + Date.now() + '_' + idx,
                stock_id: parseInt(f.stock_match_id || (stockData[0]?.id || 0)),
                gramos_tirada: parseFloat(f.gramos) || 1.0
            }));
            renderFilasColorCalculadora();
            actualizarCalculosColores();
        }

        if (statusEl) {
            const notaModo = data.es_estimacion_malla ? ' (Estimado por volumen 3D)' : ' (Datos exactos de laminado)';
            statusEl.innerHTML = `✅ <strong>${file.name}</strong> cargado${notaModo}: <strong>${data.g_por_tirada}g</strong> en <strong>${data.colores} color(es)</strong> • ⏱️ <strong>${data.tiempo_str}</strong>`;
        }

        mostrarNotificacion(`🤖 Archivo importado: ${data.g_por_tirada}g (${data.colores} colores) y ${data.tiempo_str}`);
    } catch (err) {
        console.error('Error analizando archivo slicer:', err);
        if (statusEl) {
            statusEl.classList.remove('hidden', 'text-emerald-300');
            statusEl.classList.add('text-red-400');
            statusEl.innerText = `⚠️ ${err.message}`;
        }
        alert('Error al leer el archivo: ' + err.message);
    }
}

// --- NOTIFICACIONES TOAST ---
function mostrarNotificacion(mensaje) {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    toastMsg.innerText = mensaje;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0');
        toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    }, 3500);
}

// --- ESTADO BASE DE DATOS (NEON / SQLITE) ---
let dbStatusData = null;

async function checkDbStatus() {
    try {
        const res = await fetch('/api/db-status');
        dbStatusData = await res.json();
        updateDbStatusUI();
    } catch(e) {
        console.error('Error comprobando estado de base de datos:', e);
    }
}

function updateDbStatusUI() {
    if (!dbStatusData) return;
    const btn = document.getElementById('db-status-btn');
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');
    const banner = document.getElementById('db-warning-banner');

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (dbStatusData.es_permanente) {
        if (dot) {
            dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50';
        }
        if (text) text.innerText = 'Nube Permanente (Neon)';
        if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/40';
        if (banner) banner.classList.add('hidden');
    } else if (isLocalhost) {
        // En tu PC local, SQLite guarda en database.db en tu disco duro (no se borra nada al reiniciar)
        if (dot) {
            dot.className = 'w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-400/50';
        }
        if (text) text.innerText = 'Modo Local (Tu PC)';
        if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border bg-blue-950/40 border-blue-500/30 text-blue-300 hover:bg-blue-900/40';
        if (banner) banner.classList.add('hidden');
    } else {
        if (dot) {
            dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse';
        }
        if (text) text.innerText = 'Modo Temporal (SQLite)';
        if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40 animate-pulse';
        if (banner) banner.classList.remove('hidden');
    }
}

function abrirModalDbHelp() {
    const modal = document.getElementById('modal-db-help');
    if (!modal) return;
    const details = document.getElementById('modal-db-details');
    const pill = document.getElementById('modal-db-status-pill');

    if (dbStatusData && dbStatusData.es_permanente) {
        pill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        pill.innerText = 'Conectado a Neon';
        details.innerHTML = `
            <div class="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-2">
                <p class="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span>✅ Base de Datos Permanente Activa</span>
                </p>
                <p>Todos los pedidos, gastos, materiales y diseños de la calculadora se están guardando en la nube de Neon (PostgreSQL).</p>
                <p class="text-slate-400 text-[11px]">Los datos nunca se borrarán, aunque el servidor de Render se apague por inactividad.</p>
            </div>
            <div class="text-[11px] text-slate-400 space-y-1">
                <p><strong>Enlace detectado:</strong> <code class="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300 font-mono">${dbStatusData.url_preview || 'Configurado'}</code></p>
            </div>
        `;
    } else {
        pill.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
        pill.innerText = 'Almacenamiento Temporal';
        
        let errorMsg = '';
        if (dbStatusData && dbStatusData.error) {
            errorMsg = `
            <div class="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 space-y-1">
                <p class="font-bold">⚠️ Error detectado al conectar a PostgreSQL:</p>
                <code class="block font-mono text-[10px] break-all bg-black/40 p-2 rounded">${dbStatusData.error}</code>
            </div>`;
        } else if (dbStatusData && !dbStatusData.url_detectada) {
            errorMsg = `
            <div class="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-amber-200 space-y-1">
                <p class="font-bold">⚠️ No se ha detectado la variable DATABASE_URL en Render.</p>
                <p>El servidor está guardando en el disco temporal de Render, que se reinicia cuando pasan unas horas sin visitas.</p>
            </div>`;
        }

        details.innerHTML = `
            ${errorMsg}
            <div class="space-y-3 pt-2">
                <p class="font-bold text-white">Pasos para conectar la nube permanente en 1 minuto:</p>
                <ol class="list-decimal pl-4 space-y-2 text-slate-300">
                    <li>Entra en <strong>Neon.tech</strong> y copia la cadena de conexión (empieza por <code class="text-emerald-400 font-mono">postgresql://...</code>).</li>
                    <li>Ve a tu servicio en <strong>Render.com</strong> &rarr; menú izquierdo <strong>Environment</strong>.</li>
                    <li>Añade la variable:
                        <ul class="list-disc pl-4 mt-1 space-y-0.5">
                            <li><strong>Key:</strong> <code class="bg-slate-800 px-1 rounded text-white font-mono">DATABASE_URL</code></li>
                            <li><strong>Value:</strong> <span class="text-slate-400">Pega el enlace de Neon (solo la URL, sin comillas ni 'psql')</span></li>
                        </ul>
                    </li>
                    <li>Pulsa <strong>Save Changes</strong>. Render se reiniciará en 30 segundos y los datos nunca más se perderán.</li>
                </ol>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

function cerrarModalDbHelp() {
    const modal = document.getElementById('modal-db-help');
    if (modal) modal.classList.add('hidden');
}

// --- TRANSFERENCIAS Y CUADRES ENTRE SOCIOS ---
function renderTransferenciasTable(transferencias) {
    const tbody = document.getElementById('transferencias-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!transferencias || transferencias.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-8 text-center text-slate-500 italic">
                    Aún no hay transferencias o Bizums registrados. Cuando hagáis un envío para cuadrar las cuentas, pulsa en "+ Registrar Bizum / Transferencia".
                </td>
            </tr>
        `;
        return;
    }

    transferencias.forEach(t => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors';
        
        const deIsPablo = (t.de_socio || '').toUpperCase().includes('P');
        const badgeDe = deIsPablo 
            ? '<span class="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-700/50 text-blue-300 font-bold whitespace-nowrap">👤 Pablo</span>'
            : '<span class="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 font-bold whitespace-nowrap">👤 Javi</span>';
            
        const badgeA = deIsPablo
            ? '<span class="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 font-bold whitespace-nowrap">👤 Javi</span>'
            : '<span class="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-700/50 text-blue-300 font-bold whitespace-nowrap">👤 Pablo</span>';

        tr.innerHTML = `
            <td class="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">${t.fecha || '-'}</td>
            <td class="py-2.5 px-3">${badgeDe}</td>
            <td class="py-2.5 px-3">${badgeA}</td>
            <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap text-sm">
                +${parseFloat(t.cantidad).toFixed(2)} €
            </td>
            <td class="py-2.5 px-3 text-slate-300">
                <div class="font-medium">${t.concepto || 'Cuadre de cuentas'}</div>
                ${t.notas ? `<div class="text-[11px] text-slate-500 italic">${t.notas}</div>` : ''}
            </td>
            <td class="py-2.5 px-3 text-center whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">${t.metodo || 'Bizum'}</span>
            </td>
            <td class="py-2.5 px-3 text-center">
                <button onclick="eliminarTransferenciaConfirmar(${t.id})" class="p-1 text-slate-500 hover:text-red-400 rounded transition-colors" title="Eliminar registro de transferencia">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalTransferencia(prefillAmount = null, deSocio = 'Pablo', aSocio = 'Javi') {
    document.getElementById('form-trans-id').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-trans-fecha').value = today;
    
    document.getElementById('form-trans-de').value = deSocio;
    document.getElementById('form-trans-a').value = aSocio;
    
    if (prefillAmount !== null && prefillAmount > 0) {
        document.getElementById('form-trans-cantidad').value = prefillAmount.toFixed(2);
        document.getElementById('form-trans-concepto').value = `Cuadre liquidación (${deSocio} a ${aSocio})`;
    } else {
        document.getElementById('form-trans-cantidad').value = '';
        document.getElementById('form-trans-concepto').value = 'Cuadre de cuentas 50/50';
    }
    
    document.getElementById('form-trans-metodo').value = 'Bizum';
    document.getElementById('form-trans-notas').value = '';
    
    document.getElementById('modal-transferencia').classList.remove('hidden');
}

function abrirModalTransferenciaRapida() {
    if (!balanceData || !balanceData.liquidacion) return;
    const liq = balanceData.liquidacion;
    if (liq.quien_debe && liq.cantidad_a_transferir > 0) {
        abrirModalTransferencia(liq.cantidad_a_transferir, liq.quien_debe, liq.a_quien);
    } else {
        abrirModalTransferencia();
    }
}

function actualizarReceptorAutomatico() {
    const emisor = document.getElementById('form-trans-de').value;
    const receptorSel = document.getElementById('form-trans-a');
    if (emisor === 'Pablo') {
        receptorSel.value = 'Javi';
    } else {
        receptorSel.value = 'Pablo';
    }
}

function cerrarModalTransferencia() {
    const modal = document.getElementById('modal-transferencia');
    if (modal) modal.classList.add('hidden');
}

async function guardarTransferenciaModal(e) {
    e.preventDefault();
    const cantVal = parseFloat(document.getElementById('form-trans-cantidad').value);
    if (!cantVal || cantVal <= 0) {
        alert('Por favor introduce un importe válido superior a 0 €.');
        return;
    }

    const payload = {
        fecha: document.getElementById('form-trans-fecha').value || new Date().toISOString().split('T')[0],
        de_socio: document.getElementById('form-trans-de').value,
        a_socio: document.getElementById('form-trans-a').value,
        cantidad: cantVal,
        metodo: document.getElementById('form-trans-metodo').value || 'Bizum',
        concepto: (document.getElementById('form-trans-concepto').value || 'Cuadre de cuentas').trim(),
        notas: (document.getElementById('form-trans-notas').value || '').trim()
    };

    try {
        const res = await fetch('/api/transferencias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al registrar transferencia');
        
        cerrarModalTransferencia();
        await loadBalance();
        mostrarNotificacion(`¡Transferencia de ${payload.cantidad.toFixed(2)} € (${payload.de_socio} ➡️ ${payload.a_socio}) registrada con éxito!`);
    } catch (err) {
        console.error('Error registrando transferencia:', err);
        alert('Error al guardar la transferencia. Comprueba los datos.');
    }
}

async function eliminarTransferenciaConfirmar(id) {
    if (!confirm('¿Deseas eliminar este registro de transferencia? El saldo de liquidación se recalculará automáticamente.')) {
        return;
    }
    try {
        const res = await fetch(`/api/transferencias/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        await loadBalance();
        mostrarNotificacion('Registro de transferencia eliminado.');
    } catch (e) {
        console.error('Error eliminando transferencia:', e);
        alert('Error al eliminar la transferencia.');
    }
}
