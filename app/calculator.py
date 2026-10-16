import io
import re
import json
import math
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class CalculoEntrada(BaseModel):
    # Parámetros Generales
    titulo: str = Field(default="Nuevo Proyecto", description="Nombre del proyecto o pieza")
    piezas_totales: int = Field(default=75, ge=1, description="Cantidad total de piezas a fabricar")
    
    # Módulo 3D
    incluir_3d: bool = Field(default=True)
    precio_kg: float = Field(default=20.0, ge=0, description="Precio por kg de filamento (€)")
    g_por_tirada: float = Field(default=21.0, ge=0, description="Gramos de material por tirada de impresión")
    piezas_por_tirada: int = Field(default=15, ge=1, description="Piezas impresas por tirada")
    pct_perdidas_3d: float = Field(default=0.10, ge=0, description="% de pérdidas/merma de filamento")
    coste_cambio_tirada_3d: float = Field(default=2.0, ge=0, description="Coste por cambio de tirada (€)")
    tiempo_diseno_3d_h: float = Field(default=2.0, ge=0, description="Horas de diseño 3D")
    precio_hora_diseno: float = Field(default=15.0, ge=0, description="Precio por hora de diseño (€/h)")
    colores: int = Field(default=1, ge=1, description="Número de colores a imprimir")
    min_por_tirada_3d: float = Field(default=120.0, ge=0, description="Minutos de impresión por tirada")
    
    # Módulo Corte Láser
    incluir_laser: bool = Field(default=False)
    precio_m2_madera: float = Field(default=15.0, ge=0, description="Precio m2 de tablero (€)")
    tablero_largo_cm: float = Field(default=30.0, ge=0, description="Largo del tablero en cm")
    tablero_ancho_cm: float = Field(default=30.0, ge=0, description="Ancho del tablero en cm")
    piezas_por_tablero: int = Field(default=16, ge=1, description="Piezas cortadas por tablero")
    pct_perdidas_laser: float = Field(default=0.10, ge=0, description="% de pérdidas en madera")
    coste_cambio_tirada_laser: float = Field(default=3.0, ge=0, description="Coste por cambio, limpieza y secado (€)")
    tiempo_diseno_laser_h: float = Field(default=0.0, ge=0, description="Horas de diseño corte láser")
    
    # Módulo Montajes y Fornituras
    incluir_montaje: bool = Field(default=False)
    pegar_piezas_ud: float = Field(default=0.0, ge=0, description="Coste mano de obra pegar piezas (€/ud)")
    poner_llaveros_ud: float = Field(default=0.0, ge=0, description="Coste mano de obra poner llavero/argolla (€/ud)")
    material_fornituras_ud: float = Field(default=0.0, ge=0, description="Coste de fornituras (€/ud)")
    coste_cola_fijo: float = Field(default=0.0, ge=0, description="Coste fijo de pegamento/cola (€)")
    
    # Descuento e Impuestos
    descuento_pct: float = Field(default=0.0, ge=0, le=1, description="Descuento comercial (ej. 0.10 para 10%)")
    aplicar_iva: bool = Field(default=False, description="Aplicar 21% de IVA")


class DesgloseModulo(BaseModel):
    coste_material: float
    coste_material_con_perdidas: float
    coste_tiradas: float
    coste_diseno: float
    base_subtotal: float
    recargo_colores: float = 0.0
    recargo_tramites: float = 0.0
    recargo_desgaste_energia: float = 0.0
    beneficio: float = 0.0
    coste_total: float
    coste_unitario: float


class CalculoResultado(BaseModel):
    # Desgloses
    modulo_3d: Optional[DesgloseModulo] = None
    modulo_laser: Optional[DesgloseModulo] = None
    modulo_montaje: Optional[DesgloseModulo] = None
    
    # Producción 3D
    tiradas_3d: int = 0
    kg_totales_3d: float = 0.0
    
    # Producción Láser
    tableros_laser: int = 0
    
    # Totales Proyecto
    precio_base_total: float
    precio_unitario_base: float
    
    # Descuento
    descuento_pct: float
    descuento_importe: float
    precio_con_descuento: float
    precio_unitario_con_descuento: float
    
    # Impuestos
    aplicar_iva: bool
    iva_pct: float = 0.21
    iva_importe: float
    precio_final_con_iva: float
    precio_unitario_final_con_iva: float
    
    # Seguridad / Negociación
    precio_minimo_suelo: float
    precio_minimo_unitario: float
    margen_sobre_minimo: float
    
    # Tiempos
    minutos_maquina_3d: float = 0.0
    minutos_operario_tiradas: float = 0.0
    minutos_diseno: float = 0.0
    minutos_totales: float = 0.0
    tiempo_formato_str: str = ""
    rendimiento_eur_hora: float = 0.0


def calcular_presupuesto(p: CalculoEntrada) -> CalculoResultado:
    piezas = p.piezas_totales
    subtotal_3d = 0.0
    subtotal_laser = 0.0
    subtotal_montaje = 0.0
    
    desglose_3d = None
    desglose_laser = None
    desglose_montaje = None
    
    tiradas_3d = 0
    kg_totales_3d = 0.0
    tableros_laser = 0
    
    material_suelo_puro = 0.0
    
    # 1. MÓDULO 3D
    if p.incluir_3d and p.piezas_por_tirada > 0:
        tiradas_3d = math.ceil(piezas / p.piezas_por_tirada)
        kg_totales_3d = (p.g_por_tirada * tiradas_3d) / 1000.0
        
        coste_mat_base = kg_totales_3d * p.precio_kg
        coste_mat_perdidas = coste_mat_base * (1.0 + p.pct_perdidas_3d)
        coste_tiradas = tiradas_3d * p.coste_cambio_tirada_3d
        coste_diseno = p.tiempo_diseno_3d_h * p.precio_hora_diseno
        
        base_3d = coste_diseno + coste_tiradas + coste_mat_perdidas
        
        recargo_colores = base_3d * (0.10 * (p.colores - 1)) if p.colores > 1 else 0.0
        tramites = base_3d * 0.10
        desgaste = base_3d * 0.10
        beneficio = base_3d * 0.20
        
        coste_total_3d = coste_mat_perdidas + coste_tiradas + coste_diseno + recargo_colores + desgaste + beneficio + tramites
        coste_ud_3d = coste_total_3d / piezas if piezas > 0 else 0.0
        
        desglose_3d = DesgloseModulo(
            coste_material=round(coste_mat_base, 3),
            coste_material_con_perdidas=round(coste_mat_perdidas, 3),
            coste_tiradas=round(coste_tiradas, 3),
            coste_diseno=round(coste_diseno, 3),
            base_subtotal=round(base_3d, 3),
            recargo_colores=round(recargo_colores, 3),
            recargo_tramites=round(tramites, 3),
            recargo_desgaste_energia=round(desgaste, 3),
            beneficio=round(beneficio, 3),
            coste_total=round(coste_total_3d, 3),
            coste_unitario=round(coste_ud_3d, 4)
        )
        subtotal_3d = coste_total_3d
        material_suelo_puro += coste_mat_perdidas

    # 2. MÓDULO LÁSER
    if p.incluir_laser and p.piezas_por_tablero > 0:
        tableros_laser = math.ceil(piezas / p.piezas_por_tablero)
        area_tablero_m2 = (p.tablero_largo_cm / 100.0) * (p.tablero_ancho_cm / 100.0)
        precio_por_tablero = area_tablero_m2 * p.precio_m2_madera
        
        coste_madera_base = tableros_laser * precio_por_tablero
        coste_madera_perdidas = coste_madera_base * (1.0 + p.pct_perdidas_laser)
        coste_tiradas_laser = tableros_laser * p.coste_cambio_tirada_laser
        coste_diseno_laser = p.tiempo_diseno_laser_h * p.precio_hora_diseno
        
        base_laser = coste_diseno_laser + coste_tiradas_laser + coste_madera_perdidas
        tramites_laser = base_laser * 0.10
        desgaste_laser = base_laser * 0.10
        beneficio_laser = base_laser * 0.20
        
        coste_total_laser = coste_madera_perdidas + coste_tiradas_laser + coste_diseno_laser + desgaste_laser + beneficio_laser + tramites_laser
        coste_ud_laser = coste_total_laser / piezas if piezas > 0 else 0.0
        
        desglose_laser = DesgloseModulo(
            coste_material=round(coste_madera_base, 3),
            coste_material_con_perdidas=round(coste_madera_perdidas, 3),
            coste_tiradas=round(coste_tiradas_laser, 3),
            coste_diseno=round(coste_diseno_laser, 3),
            base_subtotal=round(base_laser, 3),
            recargo_tramites=round(tramites_laser, 3),
            recargo_desgaste_energia=round(desgaste_laser, 3),
            beneficio=round(beneficio_laser, 3),
            coste_total=round(coste_total_laser, 3),
            coste_unitario=round(coste_ud_laser, 4)
        )
        subtotal_laser = coste_total_laser
        material_suelo_puro += coste_madera_perdidas

    # 3. MÓDULO MONTAJE
    if p.incluir_montaje:
        coste_pegar = piezas * p.pegar_piezas_ud
        coste_llaveros = piezas * p.poner_llaveros_ud
        coste_fornituras_puro = piezas * p.material_fornituras_ud
        base_montaje = coste_pegar + coste_llaveros + coste_fornituras_puro + p.coste_cola_fijo
        
        tramites_montaje = base_montaje * 0.05
        desgaste_montaje = base_montaje * 0.10
        beneficio_montaje = base_montaje * 0.20
        
        coste_total_montaje = base_montaje + tramites_montaje + desgaste_montaje + beneficio_montaje
        coste_ud_montaje = coste_total_montaje / piezas if piezas > 0 else 0.0
        
        desglose_montaje = DesgloseModulo(
            coste_material=round(coste_fornituras_puro, 3),
            coste_material_con_perdidas=round(coste_fornituras_puro, 3),
            coste_tiradas=round(coste_pegar + coste_llaveros, 3),
            coste_diseno=round(p.coste_cola_fijo, 3),
            base_subtotal=round(base_montaje, 3),
            recargo_tramites=round(tramites_montaje, 3),
            recargo_desgaste_energia=round(desgaste_montaje, 3),
            beneficio=round(beneficio_montaje, 3),
            coste_total=round(coste_total_montaje, 3),
            coste_unitario=round(coste_ud_montaje, 4)
        )
        subtotal_montaje = coste_total_montaje
        material_suelo_puro += (coste_fornituras_puro + p.coste_cola_fijo)

    precio_base_total = subtotal_3d + subtotal_laser + subtotal_montaje
    precio_ud_base = precio_base_total / piezas if piezas > 0 else 0.0
    
    # Descuento
    descuento_importe = precio_base_total * p.descuento_pct
    precio_con_descuento = precio_base_total - descuento_importe
    precio_ud_con_descuento = precio_con_descuento / piezas if piezas > 0 else 0.0
    
    # IVA
    iva_importe = precio_con_descuento * 0.21 if p.aplicar_iva else 0.0
    precio_final_con_iva = precio_con_descuento + iva_importe
    precio_ud_final_con_iva = precio_final_con_iva / piezas if piezas > 0 else 0.0
    
    # Precio mínimo de seguridad (suelo)
    precio_minimo_suelo = material_suelo_puro
    precio_minimo_ud = precio_minimo_suelo / piezas if piezas > 0 else 0.0
    margen_sobre_minimo = precio_con_descuento - precio_minimo_suelo
    
    # Tiempos
    min_maquina = tiradas_3d * p.min_por_tirada_3d if p.incluir_3d else 0.0
    min_cambio = tiradas_3d * 6.0 if p.incluir_3d else 0.0
    min_diseno = (p.tiempo_diseno_3d_h + (p.tiempo_diseno_laser_h if p.incluir_laser else 0.0)) * 60.0
    min_totales = min_maquina + min_cambio + min_diseno
    
    horas_ent = int(min_totales // 60)
    mins_rem = int(min_totales % 60)
    tiempo_formato_str = f"{horas_ent} h {mins_rem} min" if min_totales > 0 else "0 min"
    
    rendimiento = (precio_con_descuento / min_totales) * 60.0 if min_totales > 0 else 0.0
    
    return CalculoResultado(
        modulo_3d=desglose_3d,
        modulo_laser=desglose_laser,
        modulo_montaje=desglose_montaje,
        tiradas_3d=tiradas_3d,
        kg_totales_3d=round(kg_totales_3d, 4),
        tableros_laser=tableros_laser,
        precio_base_total=round(precio_base_total, 2),
        precio_unitario_base=round(precio_ud_base, 3),
        descuento_pct=p.descuento_pct,
        descuento_importe=round(descuento_importe, 2),
        precio_con_descuento=round(precio_con_descuento, 2),
        precio_unitario_con_descuento=round(precio_ud_con_descuento, 3),
        aplicar_iva=p.aplicar_iva,
        iva_pct=0.21,
        iva_importe=round(iva_importe, 2),
        precio_final_con_iva=round(precio_final_con_iva, 2),
        precio_unitario_final_con_iva=round(precio_ud_final_con_iva, 3),
        precio_minimo_suelo=round(precio_minimo_suelo, 2),
        precio_minimo_unitario=round(precio_minimo_ud, 3),
        margen_sobre_minimo=round(margen_sobre_minimo, 2),
        minutos_maquina_3d=round(min_maquina, 1),
        minutos_operario_tiradas=round(min_cambio, 1),
        minutos_diseno=round(min_diseno, 1),
        minutos_totales=round(min_totales, 1),
        tiempo_formato_str=tiempo_formato_str,
        rendimiento_eur_hora=round(rendimiento, 2)
    )


# --- LECTOR AUTOMÁTICO BAMBU STUDIO / ORCASLICER / PRUSASLICER (.3mf / .gcode) ---

def _normalize_hex(hex_str: str) -> str:
    if not hex_str:
        return "#64748b"
    clean = hex_str.strip().lstrip("#")
    if len(clean) >= 6:
        return "#" + clean[:6].lower()
    return "#64748b"

def _hex_to_rgb(hex_str: str):
    h = _normalize_hex(hex_str).lstrip("#")
    try:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    except Exception:
        return (100, 116, 139)

def _match_stock_item(tipo: str, color_hex: str, stock_items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not stock_items:
        return None
    target_rgb = _hex_to_rgb(color_hex)
    tipo_clean = (tipo or "PLA").strip().upper()
    best_item = None
    best_score = float("inf")

    for s in stock_items:
        s_rgb = _hex_to_rgb(s.get("color_hex") or "#64748b")
        dist = math.sqrt(sum((a - b) ** 2 for a, b in zip(target_rgb, s_rgb)))
        s_tipo = str(s.get("tipo") or "PLA").strip().upper()
        # Penalización si no coincide el tipo de material (ej. PLA vs PETG)
        penalty = 0.0 if (tipo_clean in s_tipo or s_tipo in tipo_clean) else 60.0
        score = dist + penalty
        if score < best_score:
            best_score = score
            best_item = s

    return best_item

def _parse_time_to_minutes(val: str) -> float:
    if not val:
        return 0.0
    val = val.strip()
    # Si es un número puro, asumimos segundos (como en slice_info.config o ; TIME:5400)
    if re.match(r"^\d+(\.\d+)?$", val):
        return round(float(val) / 60.0, 1)

    days = 0.0
    hours = 0.0
    mins = 0.0
    secs = 0.0

    m_d = re.search(r"(\d+)\s*d", val)
    if m_d:
        days = float(m_d.group(1))
    m_h = re.search(r"(\d+)\s*h", val)
    if m_h:
        hours = float(m_h.group(1))
    m_m = re.search(r"(\d+)\s*m", val)
    if m_m:
        mins = float(m_m.group(1))
    m_s = re.search(r"(\d+)\s*s", val)
    if m_s:
        secs = float(m_s.group(1))

    total_min = (days * 1440.0) + (hours * 60.0) + mins + (secs / 60.0)
    return round(total_min, 1)

def _parse_gcode_text(text: str) -> Dict[str, Any]:
    filamentos_g: List[float] = []
    colores_hex: List[str] = []
    extruder_colores_hex: List[str] = []
    tipos_mat: List[str] = []
    minutos = 0.0
    total_g_direct = 0.0

    for line in text.splitlines():
        line_s = line.strip()
        if not line_s.startswith(";"):
            continue

        # Gramos por extrusor/filamento:
        # ; filament used [g] = 12.34, 5.67  O  ; total filament weight [g] : 3.25,0.30
        m_g = re.match(r"^;\s*(?:total\s+)?filament\s+(?:used|weight)\s*\[g\]\s*[:=]\s*(.+)$", line_s, re.IGNORECASE)
        if m_g:
            parts = [p.strip() for p in re.split(r"[,;]", m_g.group(1)) if p.strip()]
            try:
                parsed_list = [float(x) for x in parts]
                if len(parsed_list) > 1 or not filamentos_g:
                    filamentos_g = parsed_list
            except ValueError:
                pass

        m_tot_g = re.match(r"^;\s*total\s+filament\s+(?:used|weight)\s*\[g\]\s*[:=]\s*([\d\.]+)\s*$", line_s, re.IGNORECASE)
        if m_tot_g:
            try:
                total_g_direct = float(m_tot_g.group(1))
            except ValueError:
                pass

        # Priorizar filament_colour sobre extruder_colour
        m_fcol = re.match(r"^;\s*filament_colour\s*[:=]\s*(.+)$", line_s, re.IGNORECASE)
        if m_fcol and not colores_hex:
            parts = [p.strip().strip('"') for p in re.split(r"[;,]", m_fcol.group(1)) if p.strip()]
            colores_hex = [_normalize_hex(p) for p in parts if p]

        m_ecol = re.match(r"^;\s*extruder_colour\s*[:=]\s*(.+)$", line_s, re.IGNORECASE)
        if m_ecol and not extruder_colores_hex:
            parts = [p.strip().strip('"') for p in re.split(r"[;,]", m_ecol.group(1)) if p.strip()]
            extruder_colores_hex = [_normalize_hex(p) for p in parts if p]

        # Tipos: ; filament_type = PLA;PLA;PETG
        m_type = re.match(r"^;\s*filament_type\s*[:=]\s*(.+)$", line_s, re.IGNORECASE)
        if m_type and not tipos_mat:
            tipos_mat = [p.strip().strip('"') for p in re.split(r"[;,]", m_type.group(1)) if p.strip()]

        # Tiempo de impresión (Bambu / Orca / Prusa / Cura)
        if "total estimated time:" in line_s.lower():
            m_t = re.search(r"total estimated time:\s*([^;\n]+)", line_s, re.IGNORECASE)
            if m_t:
                minutos = _parse_time_to_minutes(m_t.group(1))
        elif line_s.lower().startswith("; estimated printing time"):
            parts = line_s.split("=", 1)
            if len(parts) == 2:
                minutos = _parse_time_to_minutes(parts[1])
        elif line_s.upper().startswith(";TIME:") and minutos == 0.0:
            minutos = _parse_time_to_minutes(line_s.split(":", 1)[1])

    if not colores_hex and extruder_colores_hex:
        colores_hex = extruder_colores_hex

    filamentos = []
    for idx, g in enumerate(filamentos_g):
        if g > 0.01:
            c_hex = colores_hex[idx] if idx < len(colores_hex) else "#64748b"
            t_mat = tipos_mat[idx] if idx < len(tipos_mat) else "PLA"
            filamentos.append({
                "slicer_id": idx + 1,
                "tipo": t_mat,
                "color_hex": c_hex,
                "gramos": round(g, 2)
            })

    if not filamentos and total_g_direct > 0:
        filamentos.append({
            "slicer_id": 1,
            "tipo": tipos_mat[0] if tipos_mat else "PLA",
            "color_hex": colores_hex[0] if colores_hex else "#64748b",
            "gramos": round(total_g_direct, 2)
        })

    return {
        "filamentos": filamentos,
        "minutos": minutos
    }


def _decode_bambu_paint_extruder(paint_str: str, default_ext: int) -> int:
    """Decodifica el atributo paint_color / mmu_segmentation de Bambu Studio / PrusaSlicer."""
    if not paint_str:
        return default_ext
    s = paint_str.strip().upper()
    if s == "4":
        return 1
    if s == "8":
        return 2
    if s in ("C", "0C"):
        return 3
    if s == "1C":
        return 4
    if s == "2C":
        return 5
    # Si es un árbol subdividido largo, contamos los nibbles de pintura
    counts: Dict[int, int] = {}
    for ch in s:
        if ch == "4":
            counts[1] = counts.get(1, 0) + 1
        elif ch == "8":
            counts[2] = counts.get(2, 0) + 1
        elif ch == "C":
            counts[3] = counts.get(3, 0) + 1
    if counts:
        return max(counts.items(), key=lambda kv: kv[1])[0]
    return default_ext


def _estimar_desde_3mf_sin_laminar(zf: zipfile.ZipFile) -> Dict[str, Any]:
    """
    Analiza un proyecto .3mf de Bambu Studio / OrcaSlicer aunque no haya sido exportado como .gcode.3mf:
    - Lee project_settings.config (colores, tipos, densidades, soporte, torre de purga, relleno).
    - Lee model_settings.config y 3dmodel.model (piezas en placa, asignación de extrusor por objeto/parte).
    - Calcula el volumen 3D exacto por cada extrusor/color (incluyendo pintura MMU) y estima modelo + soporte + purga/torre.
    """
    names = zf.namelist()
    cfg_colors: List[str] = []
    cfg_types: List[str] = []
    cfg_densities: List[float] = []
    enable_support = False
    enable_prime_tower = True
    infill_ratio = 0.15
    layer_height = 0.2

    proj_cfg = [n for n in names if n.lower().endswith("project_settings.config")]
    if proj_cfg:
        try:
            jdata = json.loads(zf.read(proj_cfg[0]).decode("utf-8", errors="ignore"))
            cfg_colors = [_normalize_hex(c) for c in jdata.get("filament_colour", []) if c]
            cfg_types = [str(t) for t in jdata.get("filament_type", []) if t]
            for d in jdata.get("filament_density", []):
                try:
                    cfg_densities.append(float(d))
                except Exception:
                    cfg_densities.append(1.24)
            enable_support = str(jdata.get("enable_support", "0")) in ("1", "true", "True")
            enable_prime_tower = str(jdata.get("enable_prime_tower", "1")) in ("1", "true", "True")
            inf_str = str(jdata.get("sparse_infill_density", "15%")).replace("%", "").strip()
            try:
                infill_ratio = max(0.0, min(1.0, float(inf_str) / 100.0))
            except Exception:
                infill_ratio = 0.15
            try:
                layer_height = float(jdata.get("layer_height", 0.2) or 0.2)
            except Exception:
                layer_height = 0.2
        except Exception:
            pass

    # 1. Leer model_settings.config para saber qué extrusor usa cada (object_id, part_id) y cuántas instancias hay en la placa
    obj_default_ext: Dict[str, int] = {}
    part_ext_map: Dict[tuple, int] = {}
    part_subtype_map: Dict[tuple, str] = {}
    plate_instance_counts: Dict[str, int] = {}

    model_cfg_list = [n for n in names if n.lower().endswith("model_settings.config")]
    if model_cfg_list:
        try:
            ms_root = ET.fromstring(zf.read(model_cfg_list[0]))
            for obj_el in ms_root.findall(".//object"):
                oid = str(obj_el.attrib.get("id", ""))
                o_ext = 1
                for m in obj_el.findall("metadata"):
                    if m.attrib.get("key") == "extruder":
                        try:
                            o_ext = max(1, int(m.attrib.get("value", "1")))
                        except ValueError:
                            o_ext = 1
                obj_default_ext[oid] = o_ext
                for part_el in obj_el.findall("part"):
                    pid = str(part_el.attrib.get("id", ""))
                    subtype = str(part_el.attrib.get("subtype", "normal_part"))
                    part_subtype_map[(oid, pid)] = subtype
                    p_ext = o_ext
                    for m in part_el.findall("metadata"):
                        if m.attrib.get("key") == "extruder":
                            try:
                                p_ext = max(1, int(m.attrib.get("value", str(o_ext))))
                            except ValueError:
                                p_ext = o_ext
                    part_ext_map[(oid, pid)] = p_ext

            # Contar instancias en la primera placa con instancias
            for plate_el in ms_root.findall(".//plate"):
                insts = plate_el.findall("model_instance")
                if insts:
                    for inst in insts:
                        for m in inst.findall("metadata"):
                            if m.attrib.get("key") == "object_id":
                                oid = str(m.attrib.get("value", ""))
                                plate_instance_counts[oid] = plate_instance_counts.get(oid, 0) + 1
                    break
        except Exception:
            pass

    # 2. Cargar mallas de todos los archivos .model (indexadas por (ruta_normalizada, object_id))
    # Cada entrada guarda: {"vol_by_paint": {ext_or_0: vol_mm3}, "z_span": float}
    meshes_data: Dict[tuple, Dict[str, Any]] = {}
    top_components: Dict[str, List[ tuple ]] = {}  # top_oid -> [(sub_path, sub_oid)]
    build_counts: Dict[str, int] = {}

    model_files = [n for n in names if n.lower().endswith(".model")]
    for mf in model_files:
        norm_path = "/" + mf.lstrip("/")
        try:
            root = ET.fromstring(zf.read(mf))
            # Leer build items si es 3dmodel.model
            for item_el in root.iter():
                itag = item_el.tag.split("}")[-1].lower()
                if itag == "item":
                    printable = item_el.attrib.get("printable", "1")
                    if str(printable) not in ("0", "false", "False"):
                        boid = str(item_el.attrib.get("objectid", ""))
                        if boid:
                            build_counts[boid] = build_counts.get(boid, 0) + 1

            for obj_el in root.iter():
                otag = obj_el.tag.split("}")[-1].lower()
                if otag != "object":
                    continue
                oid = str(obj_el.attrib.get("id", ""))
                for child in obj_el:
                    ctag = child.tag.split("}")[-1].lower()
                    if ctag == "components":
                        comp_list = []
                        for comp in child:
                            if comp.tag.split("}")[-1].lower() == "component":
                                sub_oid = str(comp.attrib.get("objectid", ""))
                                sub_path = norm_path
                                for k, v in comp.attrib.items():
                                    if k.split("}")[-1].lower() == "path":
                                        sub_path = "/" + str(v).lstrip("/")
                                comp_list.append((sub_path, sub_oid))
                        if comp_list:
                            top_components[oid] = comp_list
                    elif ctag == "mesh":
                        v_parent = None
                        t_parent = None
                        for mchild in child:
                            mctag = mchild.tag.split("}")[-1].lower()
                            if mctag == "vertices":
                                v_parent = mchild
                            elif mctag == "triangles":
                                t_parent = mchild
                        if v_parent is not None and t_parent is not None:
                            verts = []
                            min_z = float("inf")
                            max_z = float("-inf")
                            for v in v_parent:
                                x = float(v.attrib.get("x", 0.0))
                                y = float(v.attrib.get("y", 0.0))
                                z = float(v.attrib.get("z", 0.0))
                                verts.append((x, y, z))
                                if z < min_z:
                                    min_z = z
                                if z > max_z:
                                    max_z = z
                            vol_by_paint: Dict[int, float] = {}
                            for t in t_parent:
                                i1 = int(t.attrib.get("v1", 0))
                                i2 = int(t.attrib.get("v2", 0))
                                i3 = int(t.attrib.get("v3", 0))
                                if i1 < len(verts) and i2 < len(verts) and i3 < len(verts):
                                    p1, p2, p3 = verts[i1], verts[i2], verts[i3]
                                    v321 = p3[0] * p2[1] * p1[2]
                                    v231 = p2[0] * p3[1] * p1[2]
                                    v312 = p3[0] * p1[1] * p2[2]
                                    v132 = p1[0] * p3[1] * p2[2]
                                    v213 = p2[0] * p1[1] * p3[2]
                                    v123 = p1[0] * p2[1] * p3[2]
                                    t_vol = (1.0 / 6.0) * (-v321 + v231 + v312 - v132 - v213 + v123)
                                    paint_attr = t.attrib.get("paint_color") or t.attrib.get("mmu_segmentation") or ""
                                    p_ext = _decode_bambu_paint_extruder(paint_attr, 0) if paint_attr else 0
                                    vol_by_paint[p_ext] = vol_by_paint.get(p_ext, 0.0) + t_vol
                            z_span = max(0.0, max_z - min_z) if max_z > min_z else 0.0
                            meshes_data[(norm_path, oid)] = {
                                "vol_by_paint": {k: abs(val) for k, val in vol_by_paint.items()},
                                "z_span": z_span
                            }
        except Exception:
            continue

    active_instances = plate_instance_counts if plate_instance_counts else build_counts
    if not active_instances and top_components:
        active_instances = {oid: 1 for oid in top_components}

    ext_vol_mm3: Dict[int, float] = {}
    ext_max_z_span: Dict[int, float] = {}
    total_piezas = sum(active_instances.values()) if active_instances else 1

    if active_instances and top_components:
        for top_oid, inst_count in active_instances.items():
            def_ext = obj_default_ext.get(top_oid, 1)
            for sub_path, sub_oid in top_components.get(top_oid, []):
                subtype = part_subtype_map.get((top_oid, sub_oid), "normal_part")
                if subtype in ("negative_part", "modifier_part", "support_blocker", "support_enforcer"):
                    continue
                part_ext = part_ext_map.get((top_oid, sub_oid), def_ext)
                mdata = meshes_data.get((sub_path, sub_oid))
                if not mdata:
                    continue
                z_sp = mdata["z_span"]
                for p_ext, v_mm3 in mdata["vol_by_paint"].items():
                    real_ext = p_ext if p_ext > 0 else part_ext
                    ext_vol_mm3[real_ext] = ext_vol_mm3.get(real_ext, 0.0) + (v_mm3 * inst_count)
                    ext_max_z_span[real_ext] = max(ext_max_z_span.get(real_ext, 0.0), z_sp)
    else:
        # Fallback si las mallas están directamente sin components
        for (mpath, moid), mdata in meshes_data.items():
            inst_count = active_instances.get(moid, 1)
            def_ext = obj_default_ext.get(moid, part_ext_map.get((moid, moid), 1))
            z_sp = mdata["z_span"]
            for p_ext, v_mm3 in mdata["vol_by_paint"].items():
                real_ext = p_ext if p_ext > 0 else def_ext
                ext_vol_mm3[real_ext] = ext_vol_mm3.get(real_ext, 0.0) + (v_mm3 * inst_count)
                ext_max_z_span[real_ext] = max(ext_max_z_span.get(real_ext, 0.0), z_sp)

    # Convertir volúmenes (mm³ -> cm³ -> gramos reales con paredes/relleno, soportes y torre de purga)
    active_exts = sorted(k for k, v in ext_vol_mm3.items() if v > 1.0)
    if not active_exts:
        active_exts = [1]
        ext_vol_mm3[1] = 1000.0
        ext_max_z_span[1] = 10.0

    max_height_mm = max(ext_max_z_span.values()) if ext_max_z_span else 10.0
    is_multicolor = len(active_exts) > 1

    filamentos_est = []
    total_swaps = 0

    for idx_pos, ext_id in enumerate(active_exts):
        vol_cm3 = ext_vol_mm3.get(ext_id, 0.0) / 1000.0
        dens = cfg_densities[ext_id - 1] if (ext_id - 1) < len(cfg_densities) else 1.25
        c_hex = cfg_colors[ext_id - 1] if (ext_id - 1) < len(cfg_colors) else "#3b82f6"
        t_mat = cfg_types[ext_id - 1] if (ext_id - 1) < len(cfg_types) else "PLA"

        # Piezas pequeñas o detalles (< 1.5 cm³) son casi 100% perímetros/capas sólidas
        if vol_cm3 < 1.5:
            eff_factor = 1.0
        else:
            # Para piezas grandes, mezcla entre perímetros sólidos (~38%) y relleno sparse
            eff_factor = 0.38 + (0.62 * infill_ratio)
        model_g = vol_cm3 * dens * eff_factor

        # Soporte (se asigna al extrusor principal / primero si enable_support está activo)
        support_g = 0.0
        if enable_support and idx_pos == 0:
            support_g = model_g * 0.415

        # Torre de limpieza (Prime Tower) y purga (Flushed) en impresiones multicolor
        tower_flush_g = 0.0
        if is_multicolor and enable_prime_tower:
            if idx_pos == 0:
                # El extrusor base construye el cuerpo de la torre durante toda la altura + su purga
                tower_flush_g = max_height_mm * 0.184
            else:
                # Los extrusores secundarios purgan en las capas donde intervienen
                z_sec = ext_max_z_span.get(ext_id, 0.8)
                swaps = 1 if z_sec <= 1.0 else max(1, int(round(z_sec / max(0.16, layer_height * 2.0))))
                total_swaps += swaps
                tower_flush_g = 0.23 * swaps

        total_ext_g = round(max(0.05, model_g + support_g + tower_flush_g), 2)
        filamentos_est.append({
            "slicer_id": ext_id,
            "tipo": t_mat,
            "color_hex": c_hex,
            "gramos": total_ext_g
        })

    total_g_all = sum(f["gramos"] for f in filamentos_est)
    # Estimación de tiempo realista (preparación/nivelación A1 ~7.5 min + velocidad media + cambios AMS)
    prep_min = 7.5
    print_min = total_g_all * 5.3
    swap_min = (total_swaps * 1.5) if is_multicolor else 0.0
    minutos_est = round(max(8.0, prep_min + print_min + swap_min), 1)

    return {
        "filamentos": filamentos_est,
        "minutos": minutos_est,
        "objetos": max(1, total_piezas)
    }


def analizar_archivo_slicer(filename: str, content: bytes, stock_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    clean_name = re.sub(r"(\.gcode\.3mf|\.3mf|\.gcode)$", "", filename or "Proyecto", flags=re.IGNORECASE).strip()
    filamentos_detectados: List[Dict[str, Any]] = []
    minutos_impresion = 0.0
    piezas_detectadas = 0
    es_estimacion_malla = False

    is_zip = content[:4] == b"PK\x03\x04" or (filename and filename.lower().endswith(".3mf"))

    if is_zip:
        try:
            with zipfile.ZipFile(io.BytesIO(content), "r") as zf:
                names = zf.namelist()

                # 1. Intentar leer Metadata/slice_info.config (Bambu Studio / OrcaSlicer .gcode.3mf)
                slice_cfg_list = [n for n in names if n.lower().endswith("slice_info.config")]
                if slice_cfg_list:
                    try:
                        xml_bytes = zf.read(slice_cfg_list[0])
                        root = ET.fromstring(xml_bytes)
                        for elem in root.iter():
                            tag = elem.tag.split("}")[-1].lower()
                            if tag == "metadata":
                                k = elem.attrib.get("key", "").lower()
                                v = elem.attrib.get("value", "")
                                if k == "prediction" and v:
                                    minutos_impresion = _parse_time_to_minutes(v)
                            elif tag == "filament":
                                used_g = float(elem.attrib.get("used_g", 0.0) or 0.0)
                                if used_g > 0.01:
                                    filamentos_detectados.append({
                                        "slicer_id": int(elem.attrib.get("id", len(filamentos_detectados) + 1)),
                                        "tipo": elem.attrib.get("type", "PLA") or "PLA",
                                        "color_hex": _normalize_hex(elem.attrib.get("color", "#64748b")),
                                        "gramos": round(used_g, 2)
                                    })
                            elif tag == "object":
                                piezas_detectadas += 1
                    except Exception:
                        pass

                # 2. Buscar cualquier archivo .gcode dentro del .3mf si falta información
                gcode_files = [n for n in names if n.lower().endswith(".gcode")]
                if gcode_files and (not filamentos_detectados or minutos_impresion == 0.0):
                    try:
                        raw_gc = zf.read(gcode_files[0])
                        if len(raw_gc) > 250000:
                            sample = (raw_gc[:125000] + b"\n" + raw_gc[-125000:]).decode("utf-8", errors="ignore")
                        else:
                            sample = raw_gc.decode("utf-8", errors="ignore")
                        parsed_gc = _parse_gcode_text(sample)
                        if not filamentos_detectados and parsed_gc["filamentos"]:
                            filamentos_detectados = parsed_gc["filamentos"]
                        if minutos_impresion == 0.0 and parsed_gc["minutos"] > 0:
                            minutos_impresion = parsed_gc["minutos"]
                    except Exception:
                        pass

                # 3. Si es un proyecto .3mf sin G-code incrustado, analizar partes multicolor, pintura MMU, soportes y torre de purga
                if not filamentos_detectados:
                    es_estimacion_malla = True
                    est = _estimar_desde_3mf_sin_laminar(zf)
                    filamentos_detectados = est["filamentos"]
                    if minutos_impresion == 0.0:
                        minutos_impresion = est["minutos"]
                    if piezas_detectadas == 0:
                        piezas_detectadas = est["objetos"]
        except zipfile.BadZipFile:
            raise ValueError("El archivo .3mf está dañado o no es un archivo comprimido válido.")
    else:
        # Archivo .gcode directo
        if len(content) > 250000:
            sample = (content[:125000] + b"\n" + content[-125000:]).decode("utf-8", errors="ignore")
        else:
            sample = content.decode("utf-8", errors="ignore")
        parsed_gc = _parse_gcode_text(sample)
        filamentos_detectados = parsed_gc["filamentos"]
        minutos_impresion = parsed_gc["minutos"]

    if not filamentos_detectados:
        raise ValueError("No se encontraron datos de filamento en el archivo. Asegúrate de subir un .gcode o .3mf exportado desde Bambu Studio / OrcaSlicer.")

    # Vincular cada filamento detectado con la bobina más parecida del stock real
    filamentos_con_stock = []
    for f in filamentos_detectados:
        match = _match_stock_item(f["tipo"], f["color_hex"], stock_items)
        filamentos_con_stock.append({
            "slicer_id": f["slicer_id"],
            "tipo": f["tipo"],
            "color_hex": f["color_hex"],
            "gramos": f["gramos"],
            "stock_match_id": match["id"] if match else (stock_items[0]["id"] if stock_items else 0),
            "stock_match_nombre": f"{match['tipo']} {match['color']}" if match else f["tipo"],
            "stock_match_hex": match["color_hex"] if match else f["color_hex"],
            "stock_disponible_g": match["stock_total_g"] if match else 0.0,
            "precio_kg": match["precio_kg_estimado"] if match else 20.0
        })

    total_g = round(sum(x["gramos"] for x in filamentos_con_stock), 2)
    num_colores = max(1, len(filamentos_con_stock))
    if minutos_impresion <= 0:
        minutos_impresion = max(15.0, round(total_g * 2.5, 0))

    h_int = int(minutos_impresion // 60)
    m_int = int(minutos_impresion % 60)
    tiempo_str = f"{h_int}h {m_int}m" if h_int > 0 else f"{m_int} min"

    return {
        "nombre_proyecto": clean_name,
        "g_por_tirada": total_g,
        "colores": num_colores,
        "min_por_tirada_3d": round(minutos_impresion, 1),
        "tiempo_str": tiempo_str,
        "piezas_detectadas": piezas_detectadas,
        "es_estimacion_malla": es_estimacion_malla,
        "filamentos": filamentos_con_stock
    }

