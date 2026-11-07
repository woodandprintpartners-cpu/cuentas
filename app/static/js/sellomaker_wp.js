import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

// --- GOOGLE FONTS FOR OPENTYPE.JS ---
const GF_CDN = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl';
const FONTS = {
    'Lobster':          { file: `${GF_CDN}/lobster/Lobster-Regular.ttf`, loaded: null },
    'Righteous':        { file: `${GF_CDN}/righteous/Righteous-Regular.ttf`, loaded: null },
    'Pacifico':         { file: `${GF_CDN}/pacifico/Pacifico-Regular.ttf`, loaded: null },
    'Permanent Marker': { file: `https://cdn.jsdelivr.net/gh/google/fonts@main/apache/permanentmarker/PermanentMarker-Regular.ttf`, loaded: null },
    'Abril Fatface':    { file: `${GF_CDN}/abrilfatface/AbrilFatface-Regular.ttf`, loaded: null },
    'Boogaloo':         { file: `${GF_CDN}/boogaloo/Boogaloo-Regular.ttf`, loaded: null },
    'Roboto':           { file: 'https://cdn.jsdelivr.net/gh/googlefonts/roboto-2@main/src/hinted/Roboto-Bold.ttf', loaded: null }
};

// --- PRESET TEMPLATES ---
const PRESET_TEMPLATES = [
    {
        name: 'Sello W&P',
        icon: '🪵',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
            <path fill="black" fill-rule="evenodd" d="M100 10 A90 90 0 1 0 100 190 A90 90 0 1 0 100 10 Z M100 22 A78 78 0 1 1 100 178 A78 78 0 1 1 100 22 Z"/>
            <path fill="black" d="M44 74 L58 130 L72 92 L86 130 L100 74 L88 74 L80 108 L72 78 L64 108 L56 74 Z M115 74 L115 130 L127 130 L127 108 L142 108 C154 108 160 100 160 91 C160 82 154 74 142 74 Z M127 84 L140 84 C145 84 148 87 148 91 C148 95 145 98 140 98 L127 98 Z"/>
        </svg>`
    },
    {
        name: 'Medalla Virgen',
        icon: '🙏',
        url: '/static/Medalla_Virgen_Solo_Figura.svg'
    },
    {
        name: 'Virgen + Aro',
        icon: '🏅',
        url: '/static/Medalla_Virgen_Completa.svg'
    },
    {
        name: 'Corona / Lacre',
        icon: '👑',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
            <path fill="black" fill-rule="evenodd" d="M100 12 A88 88 0 1 0 100 188 A88 88 0 1 0 100 12 Z M100 24 A76 76 0 1 1 100 176 A76 76 0 1 1 100 24 Z"/>
            <path fill="black" d="M50 132 L150 132 L158 78 L126 102 L100 64 L74 102 L42 78 Z M52 140 L148 140 L148 152 L52 152 Z"/>
        </svg>`
    },
    {
        name: 'Corazón',
        icon: '❤️',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
            <path fill="black" d="M100 172 C100 172 32 126 32 74 C32 48 52 30 76 30 C90 30 100 40 100 48 C100 40 110 30 124 30 C148 30 168 48 168 74 C168 126 100 172 100 172 Z"/>
        </svg>`
    },
    {
        name: 'Estrella / Flor',
        icon: '🌸',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
            <path fill="black" fill-rule="evenodd" d="M100 15 L122 72 L182 75 L135 112 L152 170 L100 136 L48 170 L65 112 L18 75 L78 72 Z M100 68 A30 30 0 1 0 100 128 A30 30 0 1 0 100 68 Z"/>
        </svg>`
    }
];

// --- MARCHING SQUARES + DOUGLAS-PEUCKER FOR RASTER & TEXT UNION ---
function marchingSquares(grid, gw, gh) {
    const at = (x, y) => (x >= 0 && x < gw && y >= 0 && y < gh) ? grid[y * gw + x] : 0;
    const cfg = (cx, cy) => (at(cx, cy) << 3) | (at(cx + 1, cy) << 2) | (at(cx + 1, cy + 1) << 1) | at(cx, cy + 1);
    const mid = (cx, cy, e) => {
        if (e === 0) return { x: cx + 0.5, y: cy };
        if (e === 1) return { x: cx + 1, y: cy + 0.5 };
        if (e === 2) return { x: cx + 0.5, y: cy + 1 };
        return { x: cx, y: cy + 0.5 };
    };
    const nb = (cx, cy, e) => {
        if (e === 0) return { cx, cy: cy - 1, e: 2 };
        if (e === 1) return { cx: cx + 1, cy, e: 3 };
        if (e === 2) return { cx, cy: cy + 1, e: 0 };
        return { cx: cx - 1, cy, e: 1 };
    };
    const exits = {};
    for (let c = 0; c < 16; c++) {
        const tl = (c >> 3) & 1, tr = (c >> 2) & 1, br = (c >> 1) & 1, bl = c & 1;
        const crossed = [];
        if (tl !== tr) crossed.push(0);
        if (tr !== br) crossed.push(1);
        if (br !== bl) crossed.push(2);
        if (tl !== bl) crossed.push(3);
        if (crossed.length === 2) {
            exits[`${c}_${crossed[0]}`] = crossed[1];
            exits[`${c}_${crossed[1]}`] = crossed[0];
        } else if (crossed.length === 4) {
            if (c === 5) { exits['5_0'] = 1; exits['5_1'] = 0; exits['5_2'] = 3; exits['5_3'] = 2; }
            if (c === 10) { exits['10_0'] = 3; exits['10_3'] = 0; exits['10_1'] = 2; exits['10_2'] = 1; }
        }
    }
    const visited = new Set();
    const contours = [];
    for (let cy = -1; cy < gh; cy++) {
        for (let cx = -1; cx < gw; cx++) {
            const c = cfg(cx, cy);
            if (c === 0 || c === 15) continue;
            const tl = (c >> 3) & 1, tr = (c >> 2) & 1, br = (c >> 1) & 1, bl = c & 1;
            const crossed = [];
            if (tl !== tr) crossed.push(0);
            if (tr !== br) crossed.push(1);
            if (br !== bl) crossed.push(2);
            if (tl !== bl) crossed.push(3);
            for (const se of crossed) {
                const sk = `${cx},${cy},${se}`;
                if (visited.has(sk)) continue;
                const pts = [];
                let px = cx, py = cy, pe = se, steps = 0;
                do {
                    const cc = cfg(px, py);
                    const ex = exits[`${cc}_${pe}`];
                    if (ex === undefined) break;
                    visited.add(`${px},${py},${pe}`);
                    visited.add(`${px},${py},${ex}`);
                    pts.push(mid(px, py, ex));
                    const n = nb(px, py, ex);
                    px = n.cx; py = n.cy; pe = n.e;
                    steps++;
                } while ((px !== cx || py !== cy || pe !== se) && steps < (gw + gh) * 15);
                if (pts.length >= 3 && px === cx && py === cy && pe === se) contours.push(pts);
            }
        }
    }
    return contours;
}

function dpSimplify(pts, eps) {
    if (pts.length <= 2) return pts;
    let mx = 0, mi = 0;
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i];
        let d;
        if (len2 === 0) d = Math.hypot(p.x - a.x, p.y - a.y);
        else {
            const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
            d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
        }
        if (d > mx) { mx = d; mi = i; }
    }
    if (mx > eps) {
        const l = dpSimplify(pts.slice(0, mi + 1), eps);
        const r = dpSimplify(pts.slice(mi), eps);
        return l.slice(0, -1).concat(r);
    }
    return [pts[0], pts[pts.length - 1]];
}

function binaryGridToSVG(grid, gw, gh, simplifyEps = 0.45) {
    const contours = marchingSquares(grid, gw, gh);
    const processed = [];
    contours.forEach(c => {
        const simple = dpSimplify(c, simplifyEps);
        if (simple.length < 3) return;
        let area = 0;
        for (let i = 0, j = simple.length - 1; i < simple.length; j = i++) {
            area += (simple[j].x + simple[i].x) * (simple[j].y - simple[i].y);
        }
        if (Math.abs(area / 2) < 4.0) return;
        processed.push({ pts: simple, area: area / 2 });
    });
    if (!processed.length) return null;

    processed.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const pip = (px, py, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
            if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    };
    processed.forEach((c, i) => {
        let depth = 0;
        for (let j = 0; j < i; j++) {
            if (pip(c.pts[0].x, c.pts[0].y, processed[j].pts)) depth++;
        }
        c.isHole = (depth % 2 === 1);
        if (c.isHole && c.area > 0) c.pts.reverse();
        if (!c.isHole && c.area < 0) c.pts.reverse();
    });

    let svgD = '';
    processed.forEach(c => {
        svgD += `M${c.pts[0].x.toFixed(2)} ${c.pts[0].y.toFixed(2)}`;
        for (let i = 1; i < c.pts.length; i++) svgD += `L${c.pts[i].x.toFixed(2)} ${c.pts[i].y.toFixed(2)}`;
        svgD += 'Z';
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gw} ${gh}"><path d="${svgD}" fill="black" fill-rule="nonzero"/></svg>`;
}

// --- 3MF MULTICOLOR EXPORTER (BAMBU STUDIO / ORCASLICER COMPATIBLE) ---
async function exportGroupTo3MF(objectGroup) {
    const zip = new JSZip();
    const components = [];
    const materials = [];
    const buildItems = [];

    const generateUUID = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });

    const processMesh = (mesh) => {
        mesh.updateMatrixWorld(true);
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position;
        const idx = geometry.index;

        const color = new THREE.Color(0xffffff);
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (mat && mat.color) color.copy(mat.color);

        let matInfo = materials.find(m => m.color.getHex() === color.getHex());
        if (!matInfo) {
            matInfo = {
                id: materials.length + 1,
                color,
                name: `Filamento_${materials.length + 1}`,
                extruder: materials.length + 1
            };
            materials.push(matInfo);
        }

        const compId = components.length + 1;
        const comp = {
            id: compId,
            type: "mesh",
            vertices: [],
            triangles: [],
            material: matInfo,
            name: mesh.name || `Parte_${compId}`,
            subComponents: [],
            uuid: generateUUID()
        };

        const vMap = new Map();
        const getV = (vi) => {
            const v = new THREE.Vector3().fromBufferAttribute(pos, vi);
            const k = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
            if (!vMap.has(k)) {
                vMap.set(k, comp.vertices.length);
                comp.vertices.push({ x: v.x, y: v.y, z: v.z });
            }
            return vMap.get(k);
        };

        if (idx) {
            for (let i = 0; i < idx.count; i += 3) {
                comp.triangles.push({ v1: getV(idx.getX(i)), v2: getV(idx.getX(i + 1)), v3: getV(idx.getX(i + 2)) });
            }
        } else {
            for (let i = 0; i < pos.count; i += 3) {
                comp.triangles.push({ v1: getV(i), v2: getV(i + 1), v3: getV(i + 2) });
            }
        }
        components.push(comp);
        return compId;
    };

    const processNode = (node) => {
        if (node.isMesh && node.visible && !node.userData.ignoreExport) {
            return processMesh(node);
        } else if (node.children && node.children.length > 0 && node.visible) {
            const subs = [];
            node.updateMatrixWorld(true);
            node.children.forEach(ch => {
                const sid = processNode(ch);
                if (sid !== -1) {
                    const rel = ch.matrixWorld.clone().premultiply(node.matrixWorld.clone().invert());
                    subs.push({ objectId: sid, transform: rel });
                }
            });
            if (subs.length > 0) {
                const aid = components.length + 1;
                components.push({
                    id: aid,
                    type: "assembly",
                    subComponents: subs,
                    name: node.name || `Ensamblaje_${aid}`,
                    vertices: [],
                    triangles: [],
                    material: null,
                    uuid: generateUUID()
                });
                return aid;
            }
        }
        return -1;
    };

    const rootId = processNode(objectGroup);
    if (rootId !== -1) {
        buildItems.push({ objectId: rootId, transformMatrix: new THREE.Matrix4(), uuid: generateUUID() });
    }

    const shift = { x: 128, y: 128, z: 0 };
    const resourcesXml = components.map(c => {
        if (c.type === "assembly") {
            const comps = c.subComponents.map(sc => {
                const e = sc.transform.elements;
                const tStr = `${e[0].toFixed(5)} ${e[1].toFixed(5)} ${e[2].toFixed(5)} ${e[4].toFixed(5)} ${e[5].toFixed(5)} ${e[6].toFixed(5)} ${e[8].toFixed(5)} ${e[9].toFixed(5)} ${e[10].toFixed(5)} ${e[12].toFixed(5)} ${e[13].toFixed(5)} ${e[14].toFixed(5)}`;
                return `<component objectid="${sc.objectId}" transform="${tStr}" />`;
            }).join("");
            return `<object id="${c.id}" type="model" name="${c.name}"><components>${comps}</components></object>`;
        } else {
            const vXml = c.vertices.map(v => `<vertex x="${v.x.toFixed(4)}" y="${v.y.toFixed(4)}" z="${v.z.toFixed(4)}" />`).join(" ");
            const tXml = c.triangles.map(t => `<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}" />`).join(" ");
            return `<object id="${c.id}" type="model" name="${c.name}"><mesh><vertices>${vXml}</vertices><triangles>${tXml}</triangles></mesh></object>`;
        }
    }).join("\n");

    const buildXml = buildItems.map(item => {
        return `<item objectid="${item.objectId}" transform="1 0 0 0 1 0 0 0 1 ${shift.x} ${shift.y} ${shift.z}" printable="1" />`;
    }).join("\n");

    const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">
    <metadata name="Application">BambuStudio-02.04.00.70</metadata>
    <resources>
${resourcesXml}
    </resources>
    <build>
${buildXml}
    </build>
</model>`;

    let objectsXml = "";
    buildItems.forEach((item, idx) => {
        const comp = components.find(c => c.id === item.objectId);
        const parts = [];
        const collect = (c) => {
            if (!c) return;
            if (c.type === "mesh") parts.push(c);
            else c.subComponents.forEach(sc => collect(components.find(x => x.id === sc.objectId)));
        };
        collect(comp);
        const partsXml = parts.map(p => `    <part id="${p.id}" subtype="normal_part">
      <metadata key="name" value="${p.name}"/>
      <metadata key="extruder" value="${p.material ? p.material.extruder : 1}"/>
    </part>`).join("\n");
        objectsXml += `  <object id="${item.objectId}">
    <metadata key="name" value="${comp.name}"/>
    <metadata key="extruder" value="1"/>
${partsXml}
  </object>\n`;
    });

    const modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objectsXml}
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <model_instance>
      <metadata key="object_id" value="${buildItems[0]?.objectId || 1}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
</config>`;

    const colors = materials.map(m => `#${m.color.getHexString()}`);
    while (colors.length < 2) colors.push("#10B981");

    const projectSettings = JSON.stringify({
        printable_area: ["0x0", "256x0", "256x256", "0x256"],
        printable_height: "256",
        filament_colour: colors,
        printer_model: "Bambu Lab A1",
        layer_height: "0.16",
        wall_loops: "3",
        sparse_infill_density: "40%"
    });

    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.com/package/2006/relationships"><Relationship Id="rel-1" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/><Relationship Id="rel-2" Target="/Metadata/model_settings.config" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/><Relationship Id="rel-3" Target="/Metadata/project_settings.config" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`);
    zip.file("3D/3dmodel.model", modelXml);
    zip.file("Metadata/model_settings.config", modelSettingsXml);
    zip.file("Metadata/project_settings.config", projectSettings);
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /><Default Extension="config" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>`);

    return await zip.generateAsync({ type: "blob", mimeType: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml", compression: "DEFLATE" });
}


// --- MAIN W&P 3D STUDIO ENGINE ---
class WP3DStudio {
    constructor() {
        this.state = {
            mode: 'emboss',          // 'emboss' | 'stamp' | 'keychain'
            embossType: 'hinge',     // 'hinge' | 'magnet'
            hingeCount: 1,
            swapPlates: true,
            magnetWidth: 6.0,
            magnetDepth: 2.0,
            baseShape: 'circle',     // 'circle' | 'rect' | 'shield' | 'none'
            width: 64.0,
            height: 45.0,
            cornerRadius: 5.0,
            padding: 4.0,
            logoScale: 1.0,
            logoOffset: 0.0,
            logoRotation: 0,
            flipX: false,
            thickness: 4.0,
            relief: 0.55,
            depth: 0.58,
            tolerance: 0.22,
            gap: -4.0,
            wireframe: true,
            darkBg: true,
            svgString: PRESET_TEMPLATES[0].svg,
            svgPaths: null,
            hingeGeo: null,
            hingeSize: new THREE.Vector3(10, 35.5, 4),
            lastRasterImage: null
        };

        this._debounceTimer = null;
        this.initScene();
        this.initUI();
        this.loadHingeAndBuild();
    }

    initScene() {
        const container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b1120);

        const w = container.clientWidth || window.innerWidth - 384;
        const h = container.clientHeight || window.innerHeight - 48;

        this.camera = new THREE.PerspectiveCamera(42, w / h, 1, 4000);
        this.camera.position.set(0, -115, 110);
        this.camera.up.set(0, 0, 1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.innerHTML = '';
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.screenSpacePanning = true;

        // Lighting
        const amb = new THREE.AmbientLight(0xffffff, 0.55);
        this.scene.add(amb);

        const dir1 = new THREE.DirectionalLight(0xffffff, 1.25);
        dir1.position.set(40, -50, 140);
        dir1.castShadow = true;
        this.scene.add(dir1);

        const dir2 = new THREE.DirectionalLight(0x93c5fd, 0.45);
        dir2.position.set(-60, 60, 50);
        this.scene.add(dir2);

        this.grid = new THREE.GridHelper(320, 32, 0x334155, 0x1e293b);
        this.grid.rotation.x = Math.PI / 2;
        this.scene.add(this.grid);

        this.mainGroup = new THREE.Group();
        this.scene.add(this.mainGroup);
        this.hingeGroup = new THREE.Group();
        this.platesGroup = new THREE.Group();
        this.mainGroup.add(this.hingeGroup);
        this.mainGroup.add(this.platesGroup);

        // Materials
        this.mats = {
            baseWhite: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.42, metalness: 0.08 }),
            accentGreen: new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35, metalness: 0.1 }),
            waxGold: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, metalness: 0.25 }),
            handleWood: new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.55, metalness: 0.05 })
        };

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    onResize() {
        const container = document.getElementById('canvas-container');
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w <= 0 || h <= 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    showToast(msg) {
        const t = document.getElementById('studio-toast');
        if (!t) return;
        t.innerHTML = msg;
        t.classList.remove('hidden');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.add('hidden'), 3800);
    }

    initUI() {
        // Populate preset templates
        const grid = document.getElementById('preset-grid');
        if (grid) {
            grid.innerHTML = '';
            PRESET_TEMPLATES.forEach((tpl, idx) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 flex flex-col items-center gap-1 text-center transition';
                btn.innerHTML = `<span class="text-xl">${tpl.icon}</span><span class="text-[10px] font-semibold text-slate-200 leading-tight">${tpl.name}</span>`;
                btn.onclick = async () => {
                    if (tpl.url) {
                        const res = await fetch(tpl.url);
                        const txt = await res.text();
                        this.loadSVGString(txt, tpl.name);
                    } else if (tpl.svg) {
                        this.loadSVGString(tpl.svg, tpl.name);
                    }
                };
                grid.appendChild(btn);
            });
        }

        // File input & Drag-and-drop
        const fileInput = document.getElementById('file-input');
        const dropZone = document.getElementById('drop-zone');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) this.handleFile(e.target.files[0]);
            });
        }
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-emerald-400'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-emerald-400'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-emerald-400');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
            });
        }
    }

    async loadHingeAndBuild() {
        try {
            const loader = new STLLoader();
            const res = await fetch('/static/Bisagra.stl');
            if (res.ok) {
                const buf = await res.arrayBuffer();
                const geo = loader.parse(buf);
                geo.center();
                geo.computeBoundingBox();
                if (geo.boundingBox) geo.translate(0, 0, -geo.boundingBox.min.z);
                this.state.hingeGeo = geo;
            }
        } catch (e) {
            console.warn('Fallback hinge geometry:', e);
        }
        if (!this.state.hingeGeo) {
            this.state.hingeGeo = new THREE.BoxGeometry(10, 35.5, 4);
        }
        this.loadSVGString(this.state.svgString);
    }

    handleFile(file) {
        const name = file.name.toLowerCase();
        const baseName = file.name.replace(/\.[^.]+$/, '');
        const fnInput = document.getElementById('export-filename');
        if (fnInput) fnInput.value = `WP_${baseName}`;

        if (name.endsWith('.svg')) {
            document.getElementById('raster-controls')?.classList.add('hidden');
            const reader = new FileReader();
            reader.onload = (ev) => this.loadSVGString(ev.target.result, file.name);
            reader.readAsText(file);
        } else if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    this.state.lastRasterImage = img;
                    document.getElementById('raster-controls')?.classList.remove('hidden');
                    this.retraceRaster();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        } else {
            this.showToast('⚠️ Formato no soportado. Usa .SVG, .PNG o .JPG');
        }
    }

    retraceRaster() {
        const img = this.state.lastRasterImage;
        if (!img) return;
        const thresh = parseInt(document.getElementById('raster-thresh')?.value || '145', 10);
        const invert = document.getElementById('raster-invert')?.checked || false;
        const tv = document.getElementById('raster-thresh-val');
        if (tv) tv.innerText = String(thresh);

        const maxDim = 260;
        const sc = Math.min(maxDim / img.width, maxDim / img.height, 1.5);
        const cw = Math.max(32, Math.round(img.width * sc));
        const ch = Math.max(32, Math.round(img.height * sc));

        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        const data = ctx.getImageData(0, 0, cw, ch).data;
        const grid = new Uint8Array(cw * ch);
        for (let i = 0; i < cw * ch; i++) {
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
            const lum = a < 64 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);
            const isDark = lum < thresh;
            grid[i] = (invert ? !isDark : isDark) ? 1 : 0;
        }

        const svg = binaryGridToSVG(grid, cw, ch, 0.55);
        if (svg) {
            this.loadSVGString(svg, 'Imagen Vectorizada');
        } else {
            this.showToast('⚠️ No se detectaron formas. Ajusta el control de Umbral.');
        }
    }

    async applyTextTo3D() {
        const text = (document.getElementById('text-input')?.value || '').trim();
        const fontName = document.getElementById('font-select')?.value || 'Lobster';
        const thicken = parseFloat(document.getElementById('text-thicken')?.value || '0.6');
        const addRing = document.getElementById('text-ring-border')?.checked || false;
        if (!text) {
            this.showToast('⚠️ Escribe algún texto primero');
            return;
        }
        try {
            const entry = FONTS[fontName];
            if (!entry.loaded) {
                this.showToast('⏳ Cargando tipografía 3D...');
                const resp = await fetch(entry.file);
                const buf = await resp.arrayBuffer();
                entry.loaded = window.opentype.parse(buf);
            }
            const font = entry.loaded;
            const lines = text.split('\n').filter(l => l.trim().length > 0);
            const fontSize = 72;
            const lineHeight = fontSize * 1.25;

            let gx1 = Infinity, gx2 = -Infinity, gy1 = Infinity, gy2 = -Infinity;
            const lps = lines.map((line, i) => {
                const p = font.getPath(line, 0, 0, fontSize);
                const bb = p.getBoundingBox();
                return { p, bb, w: bb.x2 - bb.x1, i };
            });
            const maxLineW = Math.max(...lps.map(l => l.w), 10);
            lps.forEach(lp => {
                const xShift = (maxLineW - lp.w) / 2 - lp.bb.x1;
                const yShift = lp.i * lineHeight;
                lp.xShift = xShift;
                lp.yShift = yShift;
                gx1 = Math.min(gx1, lp.bb.x1 + xShift);
                gx2 = Math.max(gx2, lp.bb.x2 + xShift);
                gy1 = Math.min(gy1, lp.bb.y1 + yShift);
                gy2 = Math.max(gy2, lp.bb.y2 + yShift);
            });

            const SC = 6;
            const pad = addRing ? 38 : 10;
            const textW = gx2 - gx1;
            const textH = gy2 - gy1;
            const boxSize = addRing ? Math.max(textW, textH) + pad * 2 : 0;
            const cw = Math.ceil((addRing ? boxSize : textW + pad * 2) * SC);
            const ch = Math.ceil((addRing ? boxSize : textH + pad * 2) * SC);

            const canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            const ctx = canvas.getContext('2d');
            ctx.scale(SC, SC);

            const totalW = cw / SC;
            const totalH = ch / SC;
            const offX = (totalW - textW) / 2 - gx1;
            const offY = (totalH - textH) / 2 - gy1;

            const p2d = new Path2D();
            lps.forEach(lp => {
                const ox = offX + lp.xShift;
                const oy = offY + lp.yShift;
                lp.p.commands.forEach(c => {
                    if (c.type === 'M') p2d.moveTo(c.x + ox, c.y + oy);
                    else if (c.type === 'L') p2d.lineTo(c.x + ox, c.y + oy);
                    else if (c.type === 'C') p2d.bezierCurveTo(c.x1 + ox, c.y1 + oy, c.x2 + ox, c.y2 + oy, c.x + ox, c.y + oy);
                    else if (c.type === 'Q') p2d.quadraticCurveTo(c.x1 + ox, c.y1 + oy, c.x + ox, c.y + oy);
                    else if (c.type === 'Z') p2d.closePath();
                });
            });

            ctx.fillStyle = '#000';
            ctx.fill(p2d, 'nonzero');
            if (thicken > 0) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = thicken;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.stroke(p2d);
            }

            if (addRing) {
                const rOuter = (Math.min(totalW, totalH) / 2) - 4;
                const rInner = rOuter - 5.5;
                ctx.beginPath();
                ctx.arc(totalW / 2, totalH / 2, rOuter, 0, Math.PI * 2, false);
                ctx.arc(totalW / 2, totalH / 2, rInner, 0, Math.PI * 2, true);
                ctx.fill('evenodd');
            }

            const imgData = ctx.getImageData(0, 0, cw, ch).data;
            const grid = new Uint8Array(cw * ch);
            for (let i = 0; i < cw * ch; i++) grid[i] = imgData[i * 4 + 3] > 128 ? 1 : 0;

            const svg = binaryGridToSVG(grid, cw, ch, 0.35);
            if (svg) {
                this.loadSVGString(svg, `Texto: ${lines[0]}`);
            }
        } catch (err) {
            console.error(err);
            this.showToast('❌ Error generando texto 3D');
        }
    }

    loadSVGString(svgTxt, label = 'Diseño') {
        try {
            const parsed = new SVGLoader().parse(svgTxt);
            const shapes = [];
            for (const p of parsed.paths || []) {
                const st = p.userData?.style || {};
                if (st.fill === 'none' && (!st.stroke || st.stroke === 'none')) continue;
                shapes.push(...SVGLoader.createShapes(p));
            }
            if (!shapes.length) {
                this.showToast('⚠️ El SVG no contiene formas cerradas rellenas.');
                return;
            }
            this.state.svgString = svgTxt;
            this.state.svgPaths = parsed.paths;
            this._cachedShapes = shapes;
            this.rebuild();
            this.showToast(`✅ ${label} aplicado en 3D`);
        } catch (e) {
            console.error('Error SVG:', e);
            this.showToast('❌ Archivo SVG inválido');
        }
    }


    rebuildDebounced() {
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(() => this.rebuild(), 90);
    }

    // --- 2D Geometry Helpers ---
    offsetPolygon(points, distance) {
        if (!points || points.length < 3 || Math.abs(distance) < 1e-4) return points;
        const clean = [];
        for (let i = 0; i < points.length; i++) {
            const next = points[(i + 1) % points.length];
            if (points[i].distanceTo(next) > 0.001) clean.push(points[i]);
        }
        if (clean.length < 3) return points;

        let area = 0;
        for (let i = 0; i < clean.length; i++) {
            const j = (i + 1) % clean.length;
            area += clean[i].x * clean[j].y - clean[j].x * clean[i].y;
        }
        const sign = (area >= 0 ? 1 : -1) * -1;
        const len = clean.length;
        const result = [];

        for (let i = 0; i < len; i++) {
            const pPrev = clean[(i - 1 + len) % len];
            const pCurr = clean[i];
            const pNext = clean[(i + 1) % len];

            const v1 = new THREE.Vector2().subVectors(pCurr, pPrev).normalize();
            const n1 = new THREE.Vector2(-v1.y, v1.x).multiplyScalar(sign);

            const v2 = new THREE.Vector2().subVectors(pNext, pCurr).normalize();
            const n2 = new THREE.Vector2(-v2.y, v2.x).multiplyScalar(sign);

            const cross = v1.x * v2.y - v1.y * v2.x;
            const isOuter = (cross * sign) < 0;

            if (isOuter && distance > 0) {
                const dot = n1.dot(n2);
                if (dot < 0.2) {
                    result.push(new THREE.Vector2().copy(pCurr).addScaledVector(n1, distance));
                    result.push(new THREE.Vector2().copy(pCurr).addScaledVector(n2, distance));
                    continue;
                }
            }

            const bisector = new THREE.Vector2().addVectors(n1, n2).normalize();
            const dotProd = n1.dot(bisector);
            let miterLen = distance;
            if (Math.abs(dotProd) > 0.1) miterLen = distance / dotProd;
            const limit = Math.abs(distance) * 2.0;
            if (Math.abs(miterLen) > limit) miterLen = Math.sign(miterLen) * limit;

            result.push(new THREE.Vector2().copy(pCurr).addScaledVector(bisector, miterLen));
        }
        return result;
    }

    createRoundedRect(w, h, r, side = 'both') {
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        const rL = (side === 'both' || side === 'left') ? Math.min(r, w / 2, h / 2) : 0;
        const rR = (side === 'both' || side === 'right') ? Math.min(r, w / 2, h / 2) : 0;

        s.moveTo(x + rL, y);
        s.lineTo(x + w - rR, y);
        if (rR > 0) s.quadraticCurveTo(x + w, y, x + w, y + rR);
        s.lineTo(x + w, y + h - rR);
        if (rR > 0) s.quadraticCurveTo(x + w, y + h, x + w - rR, y + h);
        s.lineTo(x + rL, y + h);
        if (rL > 0) s.quadraticCurveTo(x, y + h, x, y + h - rL);
        s.lineTo(x, y + rL);
        if (rL > 0) s.quadraticCurveTo(x, y, x + rL, y);
        return s;
    }

    createMagnetPlateShape(w, h, r, notchSide = 'right') {
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        const nDepth = 2.0;
        const nHalfLen = Math.min(10.0, h * 0.25);

        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);

        if (notchSide === 'right') {
            s.lineTo(x + w, -nHalfLen);
            s.bezierCurveTo(x + w, -nHalfLen * 0.5, x + w - nDepth, -nHalfLen * 0.5, x + w - nDepth, 0);
            s.bezierCurveTo(x + w - nDepth, nHalfLen * 0.5, x + w, nHalfLen * 0.5, x + w, nHalfLen);
        }

        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);

        if (notchSide === 'left') {
            s.lineTo(x, nHalfLen);
            s.bezierCurveTo(x, nHalfLen * 0.5, x + nDepth, nHalfLen * 0.5, x + nDepth, 0);
            s.bezierCurveTo(x + nDepth, -nHalfLen * 0.5, x, -nHalfLen * 0.5, x, -nHalfLen);
        }

        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
    }

    createShieldShape(w, h) {
        const s = new THREE.Shape();
        const hw = w / 2, hh = h / 2;
        s.moveTo(-hw * 0.85, hh);
        s.lineTo(hw * 0.85, hh);
        s.quadraticCurveTo(hw, hh, hw, hh * 0.75);
        s.lineTo(hw, 0);
        s.bezierCurveTo(hw, -hh * 0.55, hw * 0.45, -hh * 0.85, 0, -hh);
        s.bezierCurveTo(-hw * 0.45, -hh * 0.85, -hw, -hh * 0.55, -hw, 0);
        s.lineTo(-hw, hh * 0.75);
        s.quadraticCurveTo(-hw, hh, -hw * 0.85, hh);
        return s;
    }

    // Pre-transforms SVG shapes so they are centered at (0,0), scaled to target size, rotated, and optionally mirrored
    prepareLogoShapes(targetSize, extraMirrorX = false) {
        const rawShapes = this._cachedShapes || [];
        if (!rawShapes.length) return { shapes: [], width: 0, height: 0 };

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        rawShapes.forEach(s => {
            s.getPoints().forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
        });

        const svgW = (maxX - minX) || 100;
        const svgH = (maxY - minY) || 100;
        const svgCX = (minX + maxX) / 2;
        const svgCY = (minY + maxY) / 2;
        const scale = targetSize / Math.max(svgW, svgH);

        const rad = THREE.MathUtils.degToRad(this.state.rotation || 0);
        const cosA = Math.cos(rad), sinA = Math.sin(rad);
        const mirrorSign = (this.state.flipX ? -1 : 1) * (extraMirrorX ? -1 : 1);

        const xform = (pt) => {
            let x = (pt.x - svgCX) * scale;
            let y = -(pt.y - svgCY) * scale; // Flip SVG Y axis
            const rx = x * cosA - y * sinA;
            const ry = x * sinA + y * cosA;
            return new THREE.Vector2(rx * mirrorSign, ry);
        };

        let outMinX = Infinity, outMaxX = -Infinity, outMinY = Infinity, outMaxY = -Infinity;
        const transformed = rawShapes.map(orig => {
            let pts = orig.getPoints().map(xform);
            if (mirrorSign < 0) pts.reverse();
            pts.forEach(p => {
                if (p.x < outMinX) outMinX = p.x;
                if (p.x > outMaxX) outMaxX = p.x;
                if (p.y < outMinY) outMinY = p.y;
                if (p.y > outMaxY) outMaxY = p.y;
            });
            const ns = new THREE.Shape(pts);
            if (orig.holes && orig.holes.length) {
                ns.holes = orig.holes.map(h => {
                    let hpts = h.getPoints().map(xform);
                    if (mirrorSign < 0) hpts.reverse();
                    return new THREE.Path(hpts);
                });
            }
            return ns;
        });

        return {
            shapes: transformed,
            width: (outMaxX - outMinX) || targetSize,
            height: (outMaxY - outMinY) || targetSize
        };
    }

    clearScene() {
        while (this.mainGroup.children.length > 0) {
            const ch = this.mainGroup.children[0];
            this.mainGroup.remove(ch);
            if (ch.geometry) ch.geometry.dispose();
        }
        this.exportGroups = {
            all: new THREE.Group(),
            macho: new THREE.Group(),
            hembra: new THREE.Group()
        };
    }

    rebuild() {
        if (!this._cachedShapes || !this._cachedShapes.length) return;
        this.clearScene();

        if (this.state.mode === 'emboss') {
            this.buildEmbossModel();
        } else if (this.state.mode === 'stamp') {
            this.buildStampModel();
        } else {
            this.buildKeychainModel();
        }

        this.updateMetricsOverlay();
    }

    // =========================================================================
    // MODE 1: EMBOSSING STAMP (Sello Seco Macho + Hembra con Bisagra o Imanes)
    // =========================================================================
    buildEmbossModel() {
        const s = this.state;
        const isMagnet = s.embossType === 'magnet';
        const hingeW = 10, hingeL = 35.5, overlap = 0.05;

        const maxAllowedLogo = isMagnet ? Math.min(s.plateWidth, s.plateLength) - 14 : Math.min(s.plateWidth, s.plateLength) - 8;
        const effectiveSize = Math.min(s.logoSize, Math.max(10, maxAllowedLogo));

        // Base plate dimensions
        let pW = s.plateWidth;
        let pL = s.plateLength;
        if (!isMagnet && s.hingeCount === 3) {
            pL = Math.max(pL, hingeL * 3 - 8);
        }

        const rightIsMale = !s.swapPlates;
        const maleX = isMagnet
            ? (rightIsMale ? (pW / 2 + 5) : -(pW / 2 + 5))
            : (rightIsMale ? (hingeW / 2 + pW / 2 - overlap) : -(hingeW / 2 + pW / 2 - overlap));
        const femaleX = -maleX;

        const baseLayerDepth = Math.max(1.0, s.thickness - s.depth);

        // --- Build Hinges or Magnet Bases ---
        if (!isMagnet) {
            // Hinges in the center
            if (this.state.hingeGeo) {
                const positions = s.hingeCount === 1 ? [0]
                    : s.hingeCount === 2 ? [-(hingeL / 2 - 2), (hingeL / 2 - 2)]
                    : [-(hingeL - 4), 0, (hingeL - 4)];
                positions.forEach(yPos => {
                    const hm = new THREE.Mesh(this.state.hingeGeo.clone(), this.materials.hinge);
                    hm.position.set(0, yPos, 0);
                    this.mainGroup.add(hm);
                });
            }

            // Solid base for Male
            const mSide = maleX > 0 ? 'right' : 'left';
            const mShape = this.createRoundedRect(pW, pL, 4, mSide);
            const mGeo = new THREE.ExtrudeGeometry(mShape, { depth: s.thickness, bevelEnabled: false });
            mGeo.translate(maleX, 0, 0);
            const mMesh = new THREE.Mesh(mGeo, this.materials.darkPlate);
            this.mainGroup.add(mMesh);
            this.exportGroups.macho.add(mMesh.clone());

            // Bottom base for Female (thickness - depth)
            const fSide = femaleX > 0 ? 'right' : 'left';
            const fShape = this.createRoundedRect(pW, pL, 4, fSide);
            const fGeo = new THREE.ExtrudeGeometry(fShape, { depth: baseLayerDepth, bevelEnabled: false });
            fGeo.translate(femaleX, 0, 0);
            const fMesh = new THREE.Mesh(fGeo, this.materials.darkPlate);
            this.mainGroup.add(fMesh);
            this.exportGroups.hembra.add(fMesh.clone());
        } else {
            // MAGNET MODE: Blind magnet holes + leverage side notches
            const magR = (s.magnetWidth / 2) + 0.05;
            const holeOffX = (pW / 2) - 5.0 - magR;
            const holeOffY = (pL / 2) - 5.0 - magR;
            const solidBottom = Math.max(0.8, s.thickness - s.magnetDepth - 0.1);

            // Male Magnet Plate
            const mNotch = maleX > 0 ? 'right' : 'left';
            const mBaseShape = this.createMagnetPlateShape(pW, pL, 4, mNotch);
            const mBotGeo = new THREE.ExtrudeGeometry(mBaseShape, { depth: solidBottom, bevelEnabled: false });
            mBotGeo.translate(maleX, 0, 0);
            const mBotMesh = new THREE.Mesh(mBotGeo, this.materials.darkPlate);
            this.mainGroup.add(mBotMesh);
            this.exportGroups.macho.add(mBotMesh.clone());

            const mTopShape = this.createMagnetPlateShape(pW, pL, 4, mNotch);
            const mh1 = new THREE.Path(); mh1.absarc(-holeOffX, holeOffY, magR, 0, Math.PI * 2, false);
            const mh2 = new THREE.Path(); mh2.absarc(holeOffX, -holeOffY, magR, 0, Math.PI * 2, false);
            mTopShape.holes.push(mh1, mh2);
            const mTopGeo = new THREE.ExtrudeGeometry(mTopShape, { depth: s.magnetDepth + 0.2, bevelEnabled: false });
            mTopGeo.translate(maleX, 0, solidBottom - 0.1);
            const mTopMesh = new THREE.Mesh(mTopGeo, this.materials.darkPlate);
            this.mainGroup.add(mTopMesh);
            this.exportGroups.macho.add(mTopMesh.clone());

            // Female Magnet Plate
            const fNotch = femaleX > 0 ? 'right' : 'left';
            const fBaseShape = this.createMagnetPlateShape(pW, pL, 4, fNotch);
            const fBotGeo = new THREE.ExtrudeGeometry(fBaseShape, { depth: solidBottom, bevelEnabled: false });
            fBotGeo.translate(femaleX, 0, 0);
            const fBotMesh = new THREE.Mesh(fBotGeo, this.materials.darkPlate);
            this.mainGroup.add(fBotMesh);
            this.exportGroups.hembra.add(fBotMesh.clone());

            const midHeight = (s.thickness - s.depth) - solidBottom;
            if (midHeight > 0.05) {
                const fMidShape = this.createMagnetPlateShape(pW, pL, 4, fNotch);
                const fh1 = new THREE.Path(); fh1.absarc(holeOffX, holeOffY, magR, 0, Math.PI * 2, false);
                const fh2 = new THREE.Path(); fh2.absarc(-holeOffX, -holeOffY, magR, 0, Math.PI * 2, false);
                fMidShape.holes.push(fh1, fh2);
                const fMidGeo = new THREE.ExtrudeGeometry(fMidShape, { depth: midHeight + 0.1, bevelEnabled: false });
                fMidGeo.translate(femaleX, 0, solidBottom - 0.1);
                const fMidMesh = new THREE.Mesh(fMidGeo, this.materials.darkPlate);
                this.mainGroup.add(fMidMesh);
                this.exportGroups.hembra.add(fMidMesh.clone());
            }
        }

        // --- Build Male Relief + Female Cavity + Inner Islands ---
        const maleLogo = this.prepareLogoShapes(effectiveSize, false);
        // On hinge mode, when the two plates fold together around X=0, the female side mirrors X relative to male.
        // In both hinge and magnet modes, female cavity is mirrored horizontally so that when pressed face-to-face they match!
        const femaleLogo = this.prepareLogoShapes(effectiveSize, true);

        // 1. Male Relief (Green accent)
        maleLogo.shapes.forEach(sh => {
            const rGeo = new THREE.ExtrudeGeometry(sh, { depth: s.relief + overlap, bevelEnabled: false });
            rGeo.translate(maleX, 0, s.thickness - overlap);
            const rMesh = new THREE.Mesh(rGeo, this.materials.accentGreen);
            this.mainGroup.add(rMesh);
            this.exportGroups.macho.add(rMesh.clone());
        });

        // 2. Female Top Frame with Offset Cavity + Counter-Islands
        const fFrameShape = isMagnet
            ? this.createMagnetPlateShape(pW, pL, 4, femaleX > 0 ? 'right' : 'left')
            : this.createRoundedRect(pW, pL, 4, femaleX > 0 ? 'right' : 'left');

        if (isMagnet) {
            const magR = (s.magnetWidth / 2) + 0.05;
            const holeOffX = (pW / 2) - 5.0 - magR;
            const holeOffY = (pL / 2) - 5.0 - magR;
            const fh1 = new THREE.Path(); fh1.absarc(holeOffX, holeOffY, magR, 0, Math.PI * 2, false);
            const fh2 = new THREE.Path(); fh2.absarc(-holeOffX, -holeOffY, magR, 0, Math.PI * 2, false);
            fFrameShape.holes.push(fh1, fh2);
        }

        femaleLogo.shapes.forEach(sh => {
            // Outer contour expanded by +tolerance becomes a hole in the female top plate
            const outerPts = sh.getPoints();
            const expandedPts = this.offsetPolygon(outerPts, s.tolerance);
            fFrameShape.holes.push(new THREE.Path(expandedPts));

            // Inner holes contracted by -tolerance become positive islands on the female plate
            if (sh.holes && sh.holes.length > 0) {
                sh.holes.forEach(h => {
                    const hPts = h.getPoints();
                    const contractedPts = this.offsetPolygon(hPts, -s.tolerance);
                    if (contractedPts && contractedPts.length >= 3) {
                        const islandShape = new THREE.Shape(contractedPts);
                        const islGeo = new THREE.ExtrudeGeometry(islandShape, { depth: s.depth + overlap, bevelEnabled: false });
                        islGeo.translate(femaleX, 0, baseLayerDepth - overlap);
                        const islMesh = new THREE.Mesh(islGeo, this.materials.darkPlate);
                        this.mainGroup.add(islMesh);
                        this.exportGroups.hembra.add(islMesh.clone());
                    }
                });
            }
        });

        const fTopGeo = new THREE.ExtrudeGeometry(fFrameShape, { depth: s.depth + overlap, bevelEnabled: false });
        fTopGeo.translate(femaleX, 0, baseLayerDepth - overlap);
        const fTopMesh = new THREE.Mesh(fTopGeo, this.materials.darkPlate);
        this.mainGroup.add(fTopMesh);
        this.exportGroups.hembra.add(fTopMesh.clone());
    }

    // =========================================================================
    // MODE 2: SELLO LACRE / GALLETA / ARCILLA (Con Mango 3D Ergonómico)
    // =========================================================================
    buildStampModel() {
        const s = this.state;
        const overlap = 0.08;
        const radius = Math.max(s.plateWidth, s.plateLength) / 2;
        const effectiveSize = Math.min(s.logoSize, (radius * 2) - (s.rimWidth * 2) - 3);

        // Mirror horizontally so the stamped impression reads right-side-up!
        const logo = this.prepareLogoShapes(Math.max(8, effectiveSize), true);

        const baseShape = new THREE.Shape();
        baseShape.absarc(0, 0, radius, 0, Math.PI * 2, false);

        if (s.stampNegative) {
            // WAX / CLAY STAMP: Base disc + top cavity layer where logo is carved in + outer rim
            const botGeo = new THREE.ExtrudeGeometry(baseShape, { depth: s.thickness, bevelEnabled: false });
            const botMesh = new THREE.Mesh(botGeo, this.materials.brass);
            this.mainGroup.add(botMesh);

            // Top layer with logo carved out as negative cavity
            const cavityFrame = new THREE.Shape();
            cavityFrame.absarc(0, 0, radius, 0, Math.PI * 2, false);

            logo.shapes.forEach(sh => {
                cavityFrame.holes.push(new THREE.Path(sh.getPoints()));
                if (sh.holes && sh.holes.length) {
                    sh.holes.forEach(h => {
                        const islShape = new THREE.Shape(h.getPoints());
                        const islGeo = new THREE.ExtrudeGeometry(islShape, { depth: s.relief + overlap, bevelEnabled: false });
                        islGeo.translate(0, 0, s.thickness - overlap);
                        this.mainGroup.add(new THREE.Mesh(islGeo, this.materials.brass));
                    });
                }
            });

            const cavGeo = new THREE.ExtrudeGeometry(cavityFrame, { depth: s.relief + overlap, bevelEnabled: false });
            cavGeo.translate(0, 0, s.thickness - overlap);
            this.mainGroup.add(new THREE.Mesh(cavGeo, this.materials.accentGreen));
        } else {
            // COOKIE / FONDANT STAMP: Base plate + raised cutter outer rim + raised inner logo
            const botGeo = new THREE.ExtrudeGeometry(baseShape, { depth: s.thickness, bevelEnabled: false });
            this.mainGroup.add(new THREE.Mesh(botGeo, this.materials.darkPlate));

            if (s.rimWidth > 0) {
                const rimShape = new THREE.Shape();
                rimShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
                const innerHole = new THREE.Path();
                innerHole.absarc(0, 0, Math.max(2, radius - s.rimWidth), 0, Math.PI * 2, true);
                rimShape.holes.push(innerHole);

                const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: s.relief + 1.2 + overlap, bevelEnabled: false });
                rimGeo.translate(0, 0, s.thickness - overlap);
                this.mainGroup.add(new THREE.Mesh(rimGeo, this.materials.accentGreen));
            }

            logo.shapes.forEach(sh => {
                const rGeo = new THREE.ExtrudeGeometry(sh, { depth: s.relief + overlap, bevelEnabled: false });
                rGeo.translate(0, 0, s.thickness - overlap);
                this.mainGroup.add(new THREE.Mesh(rGeo, this.materials.accentGreen));
            });
        }

        // Ergonomic 3D-printable Handle on the back (-Z)
        if (s.stampHandle && s.handleHeight > 0) {
            const hH = s.handleHeight;
            const baseR = Math.min(radius * 0.55, 14);
            const profile = [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(baseR, 0),
                new THREE.Vector2(baseR * 0.62, hH * 0.35),
                new THREE.Vector2(baseR * 0.58, hH * 0.65),
                new THREE.Vector2(baseR * 0.92, hH * 0.88),
                new THREE.Vector2(baseR * 0.70, hH),
                new THREE.Vector2(0, hH)
            ];
            const latheGeo = new THREE.LatheGeometry(profile, 36);
            latheGeo.rotateX(-Math.PI / 2); // Point along -Z
            latheGeo.translate(0, 0, overlap);
            const handleMesh = new THREE.Mesh(latheGeo, this.materials.darkPlate);
            this.mainGroup.add(handleMesh);
        }
    }

    // =========================================================================
    // MODE 3: MEDALLA / LLAVERO / CHAPA 3D MULTICOLOR (.STL + .3MF)
    // =========================================================================
    buildKeychainModel() {
        const s = this.state;
        const overlap = 0.08;
        const w = s.plateWidth;
        const h = s.plateLength;

        const logo = this.prepareLogoShapes(s.logoSize, false);

        // 1. Base Plate (Circle, Rounded Rect, Shield, or None)
        if (s.baseShape !== 'none') {
            let plateShape;
            if (s.baseShape === 'circle') {
                plateShape = new THREE.Shape();
                plateShape.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
            } else if (s.baseShape === 'rect') {
                plateShape = this.createRoundedRect(w, h, Math.min(6, w * 0.15), 'both');
            } else {
                plateShape = this.createShieldShape(w, h);
            }

            const baseGeo = new THREE.ExtrudeGeometry(plateShape, { depth: s.thickness, bevelEnabled: false });
            this.mainGroup.add(new THREE.Mesh(baseGeo, this.materials.darkPlate));

            // Optional Raised Outer Border Rim (Bisel Exterior)
            if (s.rimWidth > 0) {
                let outerRim;
                if (s.baseShape === 'circle') {
                    outerRim = new THREE.Shape();
                    outerRim.absarc(0, 0, w / 2, 0, Math.PI * 2, false);
                    const hole = new THREE.Path();
                    hole.absarc(0, 0, Math.max(2, w / 2 - s.rimWidth), 0, Math.PI * 2, true);
                    outerRim.holes.push(hole);
                } else if (s.baseShape === 'rect') {
                    outerRim = this.createRoundedRect(w, h, Math.min(6, w * 0.15), 'both');
                    const inner = this.createRoundedRect(Math.max(4, w - s.rimWidth * 2), Math.max(4, h - s.rimWidth * 2), Math.max(1, Math.min(6, w * 0.15) - s.rimWidth), 'both');
                    outerRim.holes.push(new THREE.Path(inner.getPoints()));
                } else {
                    outerRim = this.createShieldShape(w, h);
                    const inner = this.createShieldShape(Math.max(4, w - s.rimWidth * 2), Math.max(4, h - s.rimWidth * 2));
                    outerRim.holes.push(new THREE.Path(inner.getPoints()));
                }

                const rimGeo = new THREE.ExtrudeGeometry(outerRim, { depth: s.relief + overlap, bevelEnabled: false });
                rimGeo.translate(0, 0, s.thickness - overlap);
                this.mainGroup.add(new THREE.Mesh(rimGeo, this.materials.accentGreen));
            }
        }

        // 2. Top Keychain Loop (Anilla Superior)
        if (s.loopEnabled && s.loopHole > 0) {
            const holeR = s.loopHole / 2;
            const outerR = holeR + 2.4;
            const topY = (s.baseShape === 'circle' ? w / 2 : h / 2);

            const loopShape = new THREE.Shape();
            loopShape.absarc(0, topY + outerR * 0.55, outerR, 0, Math.PI * 2, false);
            const loopHole = new THREE.Path();
            loopHole.absarc(0, topY + outerR * 0.55, holeR, 0, Math.PI * 2, true);
            loopShape.holes.push(loopHole);

            const loopGeo = new THREE.ExtrudeGeometry(loopShape, { depth: s.thickness, bevelEnabled: false });
            this.mainGroup.add(new THREE.Mesh(loopGeo, this.materials.darkPlate));
        }

        // 3. Raised SVG / Vectorized Relief (Multicolor Extruder 2 in .3MF)
        const zStart = s.baseShape === 'none' ? 0 : (s.thickness - overlap);
        const zDepth = s.baseShape === 'none' ? (s.thickness + s.relief) : (s.relief + overlap);

        logo.shapes.forEach(sh => {
            const rGeo = new THREE.ExtrudeGeometry(sh, { depth: zDepth, bevelEnabled: false });
            rGeo.translate(0, 0, zStart);
            this.mainGroup.add(new THREE.Mesh(rGeo, this.materials.accentGreen));
        });
    }

    // =========================================================================
    // UI EVENT HANDLERS & CONTROLS
    // =========================================================================
    updateMetricsOverlay() {
        let tris = 0;
        const box = new THREE.Box3();
        this.mainGroup.traverse(obj => {
            if (obj.isMesh && obj.geometry) {
                const pos = obj.geometry.attributes.position;
                if (pos) tris += obj.geometry.index ? obj.geometry.index.count / 3 : pos.count / 3;
                obj.updateMatrixWorld(true);
                box.expandByObject(obj);
            }
        });
        const sz = new THREE.Vector3();
        box.getSize(sz);
        const dimEl = document.getElementById('hud-dims');
        const triEl = document.getElementById('hud-tris');
        const badgeEl = document.getElementById('hud-mode-badge');
        if (dimEl && isFinite(sz.x)) {
            dimEl.innerText = `${sz.x.toFixed(1)} × ${sz.y.toFixed(1)} × ${sz.z.toFixed(1)} mm`;
        }
        if (triEl) triEl.innerText = `${Math.round(tris).toLocaleString('es-ES')} triángulos`;
        if (badgeEl) {
            badgeEl.innerText = this.state.mode === 'emboss'
                ? `Modo: Sello Seco (${this.state.embossType === 'hinge' ? 'Bisagra' : 'Imanes'})`
                : this.state.mode === 'stamp'
                ? `Modo: Sello ${this.state.stampNegative ? 'Lacre / Arcilla' : 'Galleta / Cortador'}`
                : `Modo: Medalla / Llavero 3D`;
        }
    }

    setMode(mode) {
        this.state.mode = mode;
        ['emboss', 'stamp', 'keychain'].forEach(m => {
            const btn = document.getElementById(`mode-btn-${m}`);
            if (btn) btn.classList.toggle('active', m === mode);
        });

        document.getElementById('panel-emboss')?.classList.toggle('hidden', mode !== 'emboss');
        document.getElementById('panel-stamp')?.classList.toggle('hidden', mode !== 'stamp');
        document.getElementById('panel-keychain')?.classList.toggle('hidden', mode !== 'keychain');
        document.getElementById('export-split-emboss')?.classList.toggle('hidden', mode !== 'emboss');
        document.getElementById('ctrl-depth-wrap')?.classList.toggle('hidden', mode !== 'emboss');
        document.getElementById('ctrl-tol-wrap')?.classList.toggle('hidden', mode !== 'emboss');

        if (mode === 'stamp') {
            this.state.plateWidth = 42;
            this.state.plateLength = 42;
            this.state.logoSize = 32;
            this.state.relief = 2.0;
        } else if (mode === 'keychain') {
            this.state.plateWidth = 55;
            this.state.plateLength = 55;
            this.state.logoSize = 44;
            this.state.thickness = 3.0;
            this.state.relief = 1.6;
        } else {
            this.state.plateWidth = 50;
            this.state.plateLength = 50;
            this.state.logoSize = 36;
            this.state.thickness = 4.0;
            this.state.relief = 0.7;
        }
        this.syncUIInputs();
        this.rebuild();
        this.setCameraView('iso');
    }

    setSourceTab(tab) {
        ['upload', 'text', 'presets'].forEach(t => {
            document.getElementById(`src-tab-${t}`)?.classList.toggle('active', t === tab);
            document.getElementById(`src-panel-${t}`)?.classList.toggle('hidden', t !== tab);
        });
    }

    setEmbossType(type) {
        this.state.embossType = type;
        document.getElementById('emboss-type-hinge')?.classList.toggle('active', type === 'hinge');
        document.getElementById('emboss-type-magnet')?.classList.toggle('active', type === 'magnet');
        document.getElementById('hinge-controls')?.classList.toggle('hidden', type !== 'hinge');
        document.getElementById('magnet-controls')?.classList.toggle('hidden', type !== 'magnet');
        if (type === 'magnet' && this.state.thickness < this.state.magnetDepth + 1.5) {
            this.state.thickness = this.state.magnetDepth + 1.5;
        }
        this.syncUIInputs();
        this.rebuild();
    }

    setMaterialPreset(preset, btnEl) {
        document.querySelectorAll('.mat-preset-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        const map = {
            foil:   { relief: 0.55, depth: 0.90, tolerance: 0.40 },
            paper:  { relief: 0.70, depth: 1.00, tolerance: 0.55 },
            card:   { relief: 0.85, depth: 1.15, tolerance: 0.70 },
            kraft:  { relief: 1.15, depth: 1.45, tolerance: 1.10 }
        };
        const cfg = map[preset];
        if (cfg) {
            this.state.relief = cfg.relief;
            this.state.depth = cfg.depth;
            this.state.tolerance = cfg.tolerance;
            this.syncUIInputs();
            this.rebuild();
        }
    }

    setHingeCount(n) {
        this.state.hingeCount = n;
        [1, 2, 3].forEach(c => {
            document.getElementById(`hinge-cnt-${c}`)?.classList.toggle('active', c === n);
        });
        this.rebuild();
    }

    updateMagnetSize(val) {
        const [d, h] = val.split('x').map(Number);
        if (d && h) {
            this.state.magnetWidth = d;
            this.state.magnetDepth = h;
            if (this.state.thickness < h + 1.5) this.state.thickness = h + 1.5;
            this.syncUIInputs();
            this.rebuild();
        }
    }

    swapPlatesToggle() {
        this.state.swapPlates = !this.state.swapPlates;
        this.rebuild();
    }

    setStampPreset(preset) {
        document.getElementById('stamp-pre-wax')?.classList.toggle('active', preset === 'wax');
        document.getElementById('stamp-pre-cookie')?.classList.toggle('active', preset === 'cookie');
        if (preset === 'wax') {
            this.state.stampNegative = true;
            this.state.stampHandle = true;
            this.state.rimWidth = 2.0;
            this.state.relief = 1.8;
            this.state.plateWidth = 35;
            this.state.plateLength = 35;
            this.state.logoSize = 27;
        } else {
            this.state.stampNegative = false;
            this.state.stampHandle = true;
            this.state.rimWidth = 1.6;
            this.state.relief = 3.0;
            this.state.plateWidth = 65;
            this.state.plateLength = 65;
            this.state.logoSize = 52;
        }
        const negCheck = document.getElementById('stamp-negative');
        if (negCheck) negCheck.checked = this.state.stampNegative;
        const hndCheck = document.getElementById('stamp-handle');
        if (hndCheck) hndCheck.checked = this.state.stampHandle;
        this.syncUIInputs();
        this.rebuild();
    }

    setBaseShape(shape) {
        this.state.baseShape = shape;
        ['circle', 'rect', 'shield', 'none'].forEach(sh => {
            document.getElementById(`base-shape-${sh}`)?.classList.toggle('active', sh === shape);
        });
        this.rebuild();
    }

    rotateLogo() {
        this.state.rotation = (this.state.rotation + 90) % 360;
        this.rebuild();
    }

    toggleFlipX() {
        this.state.flipX = !this.state.flipX;
        document.getElementById('btn-flip-x')?.classList.toggle('active', this.state.flipX);
        this.rebuild();
    }

    onSlider(name, val) {
        const num = parseFloat(val);
        if (isNaN(num)) return;
        this.state[name] = num;
        this.syncUIInputs();
        this.rebuildDebounced();
    }

    onNumberParams() {
        const pw = parseFloat(document.getElementById('inp-plate-w')?.value || '50');
        const pl = parseFloat(document.getElementById('inp-plate-l')?.value || '50');
        this.state.plateWidth = Math.max(15, Math.min(180, pw));
        this.state.plateLength = Math.max(15, Math.min(180, pl));

        const hh = parseFloat(document.getElementById('inp-handle-h')?.value || '22');
        const rw = parseFloat(document.getElementById('inp-rim-w')?.value || '1.8');
        this.state.handleHeight = Math.max(0, hh);
        this.state.rimWidth = Math.max(0, rw);

        const sn = document.getElementById('stamp-negative');
        if (sn) this.state.stampNegative = sn.checked;
        const sh = document.getElementById('stamp-handle');
        if (sh) this.state.stampHandle = sh.checked;

        const le = document.getElementById('keychain-loop');
        if (le) this.state.loopEnabled = le.checked;
        const lh = parseFloat(document.getElementById('inp-loop-hole')?.value || '4.5');
        this.state.loopHole = Math.max(0, lh);

        const kr = parseFloat(document.getElementById('inp-key-rim')?.value || '1.6');
        if (this.state.mode === 'keychain') this.state.rimWidth = Math.max(0, kr);

        this.rebuildDebounced();
    }

    syncUIInputs() {
        const s = this.state;
        const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };

        setVal('sl-logo-size', s.logoSize);
        setTxt('lbl-logo-size', `${s.logoSize} mm`);
        setVal('sl-thickness', s.thickness);
        setTxt('lbl-thickness', `${s.thickness.toFixed(1)} mm`);
        setVal('sl-relief', s.relief);
        setTxt('lbl-relief', `${s.relief.toFixed(2)} mm`);
        setVal('sl-depth', s.depth);
        setTxt('lbl-depth', `${s.depth.toFixed(2)} mm`);
        setVal('sl-tolerance', s.tolerance);
        setTxt('lbl-tolerance', `${s.tolerance.toFixed(2)} mm`);

        setVal('inp-plate-w', s.plateWidth);
        setVal('inp-plate-l', s.plateLength);
        setVal('inp-handle-h', s.handleHeight);
        setVal('inp-rim-w', s.rimWidth);
        setVal('inp-key-rim', s.rimWidth);
        setVal('inp-loop-hole', s.loopHole);
    }

    resetDefaults() {
        this.setMode(this.state.mode);
        this.showToast('🔄 Parámetros restaurados');
    }

    setCameraView(view) {
        if (view === 'top') {
            this.camera.position.set(0, 0.01, 135);
        } else if (view === 'front') {
            this.camera.position.set(0, -125, 25);
        } else {
            this.camera.position.set(0, -85, 95);
        }
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    toggleWireframe() {
        this.state.wireframe = !this.state.wireframe;
        Object.values(this.materials).forEach(m => { m.wireframe = this.state.wireframe; });
        document.getElementById('btn-wireframe')?.classList.toggle('active', this.state.wireframe);
    }

    toggleBg() {
        this.state.lightBg = !this.state.lightBg;
        this.scene.background = new THREE.Color(this.state.lightBg ? 0xe2e8f0 : 0x090d16);
    }

    // =========================================================================
    // UNLIMITED .STL & MULTICOLOR .3MF EXPORT
    // =========================================================================
    getCleanFilename(suffix = '') {
        const raw = (document.getElementById('export-filename')?.value || 'WP_Diseno_3D').trim();
        const clean = raw.replace(/[^a-zA-Z0-9_\-]/g, '_');
        return suffix ? `${clean}_${suffix}` : clean;
    }

    triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    async exportMain(format = 'stl') {
        const fname = this.getCleanFilename(this.state.mode);
        if (format === '3mf') {
            this.showToast('⏳ Generando archivo .3MF Multicolor...');
            const blob = await exportGroupTo3MF(this.mainGroup, fname);
            if (blob) {
                this.triggerBlobDownload(blob, `${fname}.3mf`);
                this.showToast(`✅ Descargado: ${fname}.3mf (Listo para Bambu Studio / OrcaSlicer)`);
            } else {
                this.showToast('❌ Error al generar .3MF');
            }
        } else {
            const exporter = new STLExporter();
            const res = exporter.parse(this.mainGroup, { binary: true });
            const blob = new Blob([res], { type: 'application/octet-stream' });
            this.triggerBlobDownload(blob, `${fname}.stl`);
            this.showToast(`✅ Descargado: ${fname}.stl`);
        }
    }

    exportSinglePlate(which = 'macho') {
        const grp = which === 'macho' ? this.exportGroups.macho : this.exportGroups.hembra;
        if (!grp || grp.children.length === 0) {
            this.showToast('⚠️ Cambia a Modo Sello Seco para exportar placas individuales');
            return;
        }
        const fname = this.getCleanFilename(which.toUpperCase());
        const exporter = new STLExporter();
        const res = exporter.parse(grp, { binary: true });
        const blob = new Blob([res], { type: 'application/octet-stream' });
        this.triggerBlobDownload(blob, `${fname}.stl`);
        this.showToast(`✅ Descargado: ${fname}.stl`);
    }

    showToast(msg) {
        const t = document.getElementById('studio-toast');
        if (!t) return;
        t.innerText = msg;
        t.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
        t.classList.add('opacity-100', 'translate-y-0');
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            t.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            t.classList.remove('opacity-100', 'translate-y-0');
        }, 3200);
    }
}

window.studio = new WP3DStudio();
