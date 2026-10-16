import io
import re
import gc
import json
import math
import array
import zipfile
import xml.etree.ElementTree as ET
from typing import Optional, List, Dict, Any, Union, BinaryIO
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
    boquilla_mm = 0.4
    altura_capa_mm = 0.2
    tipo_placa = ""

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

        # Boquilla: ; nozzle_diameter = 0.2
        m_noz = re.match(r"^;\s*nozzle_diameter\s*[:=]\s*([\d\.]+)", line_s, re.IGNORECASE)
        if m_noz:
            try:
                boquilla_mm = round(float(m_noz.group(1)), 2)
            except ValueError:
                pass

        # Altura de capa: ; layer_height = 0.1
        m_lh = re.match(r"^;\s*layer_height\s*[:=]\s*([\d\.]+)", line_s, re.IGNORECASE)
        if m_lh:
            try:
                altura_capa_mm = round(float(m_lh.group(1)), 2)
            except ValueError:
                pass

        # Tipo de placa/cama: ; curr_bed_type = Textured PEI Plate
        m_bed = re.match(r"^;\s*curr_bed_type\s*[:=]\s*(.+)$", line_s, re.IGNORECASE)
        if m_bed and not tipo_placa:
            tipo_placa = m_bed.group(1).strip().strip('"')

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
        "minutos": minutos,
        "boquilla_mm": boquilla_mm,
        "altura_capa_mm": altura_capa_mm,
        "tipo_placa": tipo_placa
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


def _format_minutes_str(mins: float) -> str:
    h_int = int(mins // 60)
    m_int = int(mins % 60)
    return f"{h_int}h {m_int}m" if h_int > 0 else f"{m_int} min"


def _estimar_desde_3mf_sin_laminar(zf: zipfile.ZipFile) -> Dict[str, Any]:
    """
    Analiza un proyecto .3mf de Bambu Studio / OrcaSlicer aunque no haya sido exportado como .gcode.3mf:
    - Detecta la boquilla (0.2 / 0.4 / 0.6 / 0.8 mm), altura de capa y tipo de cama (PEI Texturizada, Cool Plate, etc.).
    - Detecta TODAS las camas/placas con objetos del proyecto (plate_1, plate_2, plate_3...) y calcula cada una por separado
      además de la opción "Todas las camas juntas".
    - Descuenta el solapamiento booleano cuando una pieza base contiene sub-piezas vectoriales incrustadas.
    - Simula capa por capa los cambios de filamento (swaps), los desechos expulsados (flush) y la torre de limpieza.
    """
    names = zf.namelist()
    cfg_colors: List[str] = []
    cfg_types: List[str] = []
    cfg_densities: List[float] = []
    enable_support = False
    enable_prime_tower = True
    infill_ratio = 0.15
    layer_height = 0.2
    nozzle_diameter = 0.4
    bed_type_str = "Textured PEI Plate"
    flush_matrix: List[float] = []
    flush_multiplier = 1.0
    prime_volumes: List[float] = []

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
                    cfg_densities.append(1.25)
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
            raw_noz = jdata.get("nozzle_diameter", ["0.4"])
            if isinstance(raw_noz, list) and raw_noz:
                try:
                    nozzle_diameter = round(float(raw_noz[0]), 2)
                except Exception:
                    nozzle_diameter = 0.4
            elif isinstance(raw_noz, (int, float, str)):
                try:
                    nozzle_diameter = round(float(raw_noz), 2)
                except Exception:
                    nozzle_diameter = 0.4
            if jdata.get("curr_bed_type"):
                bed_type_str = str(jdata.get("curr_bed_type"))
            raw_fm = jdata.get("flush_volumes_matrix", [])
            if isinstance(raw_fm, list):
                for val in raw_fm:
                    try:
                        flush_matrix.append(float(val))
                    except Exception:
                        flush_matrix.append(280.0)
            raw_fmult = jdata.get("flush_multiplier", ["1.0"])
            if isinstance(raw_fmult, list) and raw_fmult:
                try:
                    flush_multiplier = float(raw_fmult[0])
                except Exception:
                    flush_multiplier = 1.0
            elif isinstance(raw_fmult, (int, float, str)):
                try:
                    flush_multiplier = float(raw_fmult)
                except Exception:
                    flush_multiplier = 1.0
            raw_pv = jdata.get("filament_prime_volume", [])
            if isinstance(raw_pv, list):
                for val in raw_pv:
                    try:
                        prime_volumes.append(float(val))
                    except Exception:
                        prime_volumes.append(30.0)
        except Exception:
            pass

    # Leer todos los Metadata/plate_X.json disponibles (tiempo de 1ª capa, boquilla, altura de capa y primer extrusor por placa)
    plate_json_info: Dict[str, Dict[str, Any]] = {}
    for n in names:
        m_pj = re.search(r"plate_(\d+)\.json$", n, re.IGNORECASE)
        if m_pj:
            pid_str = m_pj.group(1)
            try:
                pdata = json.loads(zf.read(n).decode("utf-8", errors="ignore"))
                p_lh = layer_height
                p_area = 0.0
                for bo in pdata.get("bbox_objects", []):
                    if bo.get("name") != "wipe_tower":
                        p_area += float(bo.get("area", 0.0) or 0.0)
                        lh_bo = float(bo.get("layer_height", 0.0) or 0.0)
                        if lh_bo > 0.02:
                            p_lh = round(lh_bo, 2)
                p_noz = round(float(pdata.get("nozzle_diameter", nozzle_diameter) or nozzle_diameter), 2)
                plate_json_info[pid_str] = {
                    "first_layer_time_s": float(pdata.get("first_layer_time", 0.0) or 0.0),
                    "first_extruder_idx": int(pdata.get("first_extruder", 0) or 0),
                    "layer_height": p_lh,
                    "nozzle_diameter": p_noz,
                    "bed_type": str(pdata.get("bed_type", bed_type_str) or bed_type_str),
                    "area_mm2": p_area
                }
            except Exception:
                pass

    # 1. Leer model_settings.config para saber qué extrusor usa cada (object_id, part_id) y TODAS las placas con objetos
    obj_default_ext: Dict[str, int] = {}
    part_ext_map: Dict[tuple, int] = {}
    part_subtype_map: Dict[tuple, str] = {}
    plates_definitions: List[Dict[str, Any]] = []  # [{"plate_id": "1", "plate_name": "...", "instances": {oid: count}}]

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

            for idx_p, plate_el in enumerate(ms_root.findall(".//plate")):
                insts = plate_el.findall("model_instance")
                if not insts:
                    continue
                p_id = str(idx_p + 1)
                p_name = ""
                for m in plate_el.findall("metadata"):
                    if m.attrib.get("key") == "plater_id" and m.attrib.get("value"):
                        p_id = str(m.attrib.get("value"))
                    elif m.attrib.get("key") == "plater_name" and m.attrib.get("value"):
                        p_name = str(m.attrib.get("value")).strip()
                p_counts: Dict[str, int] = {}
                for inst in insts:
                    for m in inst.findall("metadata"):
                        if m.attrib.get("key") == "object_id":
                            oid = str(m.attrib.get("value", ""))
                            if oid:
                                p_counts[oid] = p_counts.get(oid, 0) + 1
                if p_counts:
                    plates_definitions.append({
                        "plate_id": p_id,
                        "plate_name": p_name,
                        "instances": p_counts
                    })
        except Exception:
            pass

    # 2. Cargar mallas de todos los archivos .model en streaming (bajo consumo de RAM < 8 MB para Render)
    meshes_data: Dict[tuple, Dict[str, Any]] = {}
    top_components: Dict[str, List[tuple]] = {}  # top_oid -> [(sub_path, sub_oid, tz)]
    build_counts: Dict[str, int] = {}
    paint_cache: Dict[bytes, int] = {}

    attr_re = re.compile(rb'([A-Za-z0-9_:]+)="([^"]*)"')
    model_files = [n for n in names if n.lower().endswith(".model")]
    for mf in model_files:
        norm_path = "/" + mf.lstrip("/")
        try:
            with zf.open(mf, "r") as mstream:
                cur_oid = ""
                comp_list: List[tuple] = []
                vx = array.array("f")
                vy = array.array("f")
                vz = array.array("f")
                min_z = float("inf")
                max_z = float("-inf")
                vol_by_paint: Dict[int, float] = {}
                has_mesh = False

                for raw_line in mstream:
                    s = raw_line.strip()
                    if not s:
                        continue
                    if s.startswith(b"<vertex "):
                        parts = s.split(b'"')
                        if len(parts) >= 6:
                            x = float(parts[1])
                            y = float(parts[3])
                            z = float(parts[5])
                            vx.append(x)
                            vy.append(y)
                            vz.append(z)
                            if z < min_z:
                                min_z = z
                            if z > max_z:
                                max_z = z
                    elif s.startswith(b"<triangle "):
                        parts = s.split(b'"')
                        if len(parts) >= 6:
                            i1 = int(parts[1])
                            i2 = int(parts[3])
                            i3 = int(parts[5])
                            n_v = len(vx)
                            if i1 < n_v and i2 < n_v and i3 < n_v:
                                x1, y1, z1 = vx[i1], vy[i1], vz[i1]
                                x2, y2, z2 = vx[i2], vy[i2], vz[i2]
                                x3, y3, z3 = vx[i3], vy[i3], vz[i3]
                                t_vol = (-x3 * y2 * z1 + x2 * y3 * z1 + x3 * y1 * z2 - x1 * y3 * z2 - x2 * y1 * z3 + x1 * y2 * z3) / 6.0
                                p_ext = 0
                                if len(parts) >= 8:
                                    # Check for paint_color or mmu_segmentation attribute
                                    p_raw = parts[7]
                                    if p_raw:
                                        p_ext = paint_cache.get(p_raw, -1)
                                        if p_ext < 0:
                                            p_ext = _decode_bambu_paint_extruder(p_raw.decode("ascii", errors="ignore"), 0)
                                            paint_cache[p_raw] = p_ext
                                vol_by_paint[p_ext] = vol_by_paint.get(p_ext, 0.0) + t_vol
                    elif s.startswith(b"<object "):
                        attrs = {k.split(b":")[-1].lower(): v.decode("utf-8", errors="ignore") for k, v in attr_re.findall(s)}
                        cur_oid = attrs.get(b"id", "")
                        comp_list = []
                        vx = array.array("f")
                        vy = array.array("f")
                        vz = array.array("f")
                        min_z = float("inf")
                        max_z = float("-inf")
                        vol_by_paint = {}
                        has_mesh = False
                    elif s.startswith(b"<mesh"):
                        has_mesh = True
                    elif s.startswith(b"</object>"):
                        if cur_oid:
                            if comp_list:
                                top_components[cur_oid] = comp_list
                            if has_mesh and len(vx) > 0:
                                meshes_data[(norm_path, cur_oid)] = {
                                    "vol_by_paint": {k: abs(val) for k, val in vol_by_paint.items()},
                                    "min_z": min_z if min_z != float("inf") else 0.0,
                                    "max_z": max_z if max_z != float("-inf") else 0.0
                                }
                        cur_oid = ""
                        comp_list = []
                        vx = array.array("f")
                        vy = array.array("f")
                        vz = array.array("f")
                        vol_by_paint = {}
                    elif s.startswith(b"<component "):
                        attrs = {k.split(b":")[-1].lower(): v.decode("utf-8", errors="ignore") for k, v in attr_re.findall(s)}
                        sub_oid = attrs.get(b"objectid", "")
                        sub_path = norm_path
                        if b"path" in attrs and attrs[b"path"]:
                            sub_path = "/" + attrs[b"path"].lstrip("/")
                        tz = 0.0
                        tr_str = attrs.get(b"transform", "")
                        if tr_str:
                            parts_tr = tr_str.split()
                            if len(parts_tr) >= 12:
                                try:
                                    tz = float(parts_tr[11])
                                except ValueError:
                                    tz = 0.0
                        if sub_oid:
                            comp_list.append((sub_path, sub_oid, tz))
                    elif s.startswith(b"<item "):
                        attrs = {k.split(b":")[-1].lower(): v.decode("utf-8", errors="ignore") for k, v in attr_re.findall(s)}
                        printable = attrs.get(b"printable", "1")
                        if printable not in ("0", "false", "False"):
                            boid = attrs.get(b"objectid", "")
                            if boid:
                                build_counts[boid] = build_counts.get(boid, 0) + 1
        except Exception:
            continue
    gc.collect()

    if not plates_definitions:
        fallback_inst = build_counts if build_counts else ({oid: 1 for oid in top_components} if top_components else {})
        plates_definitions.append({
            "plate_id": "1",
            "plate_name": "Placa 1",
            "instances": fallback_inst
        })

    # Si alguna placa tiene plate_X.json con first_layer_time_s, guardamos su ratio seg/mm³ por si otras placas del mismo proyecto no tienen plate_Y.json
    ref_fl_s_per_mm3 = 0.0

    def _calcular_una_placa(p_def: Dict[str, Any]) -> Dict[str, Any]:
        nonlocal ref_fl_s_per_mm3
        pid = p_def["plate_id"]
        pname = p_def["plate_name"]
        active_instances = p_def["instances"]
        total_piezas = sum(active_instances.values()) if active_instances else 1

        p_meta = plate_json_info.get(pid, {})
        # Si no hay plate_X.json exacto pero solo hay un plate_Y.json en el archivo y una sola placa, usarlo
        if not p_meta and len(plates_definitions) == 1 and plate_json_info:
            p_meta = next(iter(plate_json_info.values()))

        p_nozzle = p_meta.get("nozzle_diameter", nozzle_diameter)
        p_lh = p_meta.get("layer_height", layer_height)
        p_bed = p_meta.get("bed_type", bed_type_str)
        p_fl_time_s = p_meta.get("first_layer_time_s", 0.0)
        p_first_ext_idx = p_meta.get("first_extruder_idx", 0)

        ext_vol_mm3: Dict[int, float] = {}
        placed_intervals: List[Dict[str, Any]] = []

        if active_instances and top_components:
            for top_oid, inst_count in active_instances.items():
                def_ext = obj_default_ext.get(top_oid, 1)
                obj_parts = []
                for sub_path, sub_oid, tz in top_components.get(top_oid, []):
                    subtype = part_subtype_map.get((top_oid, sub_oid), "normal_part")
                    if subtype in ("negative_part", "modifier_part", "support_blocker", "support_enforcer"):
                        continue
                    part_ext = part_ext_map.get((top_oid, sub_oid), def_ext)
                    mdata = meshes_data.get((sub_path, sub_oid))
                    if not mdata:
                        continue
                    z0 = mdata["min_z"] + tz
                    z1 = mdata["max_z"] + tz
                    for p_ext, v_mm3 in mdata["vol_by_paint"].items():
                        real_ext = p_ext if p_ext > 0 else part_ext
                        obj_parts.append({
                            "sub_oid": sub_oid,
                            "ext": real_ext,
                            "z0": z0,
                            "z1": z1,
                            "vol": v_mm3
                        })

                if not obj_parts:
                    continue

                min_obj_z = min(p["z0"] for p in obj_parts)
                for p in obj_parts:
                    p["z0"] = round(p["z0"] - min_obj_z, 3)
                    p["z1"] = round(p["z1"] - min_obj_z, 3)

                if len(obj_parts) > 1:
                    base_p = obj_parts[0]
                    bz0, bz1 = base_p["z0"], base_p["z1"]
                    carved_vol = 0.0
                    for other_p in obj_parts[1:]:
                        oz0, oz1 = other_p["z0"], other_p["z1"]
                        o_span = max(0.001, oz1 - oz0)
                        ov_z = max(0.0, min(bz1, oz1) - max(bz0, oz0))
                        if ov_z > 0.01:
                            carved_vol += other_p["vol"] * (ov_z / o_span)
                    if carved_vol > 0.0:
                        base_p["vol"] = max(0.0, base_p["vol"] - carved_vol)

                for p in obj_parts:
                    if p["vol"] > 0.5:
                        ext = p["ext"]
                        ext_vol_mm3[ext] = ext_vol_mm3.get(ext, 0.0) + (p["vol"] * inst_count)
                        placed_intervals.append({
                            "ext": ext,
                            "z0": p["z0"],
                            "z1": p["z1"],
                            "vol": p["vol"] * inst_count
                        })
        else:
            for (mpath, moid), mdata in meshes_data.items():
                if active_instances and moid not in active_instances:
                    continue
                inst_count = active_instances.get(moid, 1) if active_instances else 1
                def_ext = obj_default_ext.get(moid, part_ext_map.get((moid, moid), 1))
                z0 = 0.0
                z1 = max(0.1, mdata["max_z"] - mdata["min_z"])
                for p_ext, v_mm3 in mdata["vol_by_paint"].items():
                    real_ext = p_ext if p_ext > 0 else def_ext
                    if v_mm3 > 0.5:
                        ext_vol_mm3[real_ext] = ext_vol_mm3.get(real_ext, 0.0) + (v_mm3 * inst_count)
                        placed_intervals.append({
                            "ext": real_ext,
                            "z0": z0,
                            "z1": z1,
                            "vol": v_mm3 * inst_count
                        })

        active_exts = sorted(k for k, v in ext_vol_mm3.items() if v > 0.5)
        if not active_exts:
            active_exts = [1]
            ext_vol_mm3[1] = 1000.0
            placed_intervals = [{"ext": 1, "z0": 0.0, "z1": 10.0, "vol": 1000.0}]

        total_vol_plate_mm3 = sum(ext_vol_mm3.values())
        if p_fl_time_s > 10.0 and total_vol_plate_mm3 > 10.0:
            ref_fl_s_per_mm3 = p_fl_time_s / total_vol_plate_mm3

        max_height_mm = max((iv["z1"] for iv in placed_intervals), default=10.0)
        lh = max(0.06, p_lh)
        num_layers = max(1, int(round(max_height_mm / lh)))
        is_multicolor = len(active_exts) > 1

        swaps_per_ext: Dict[int, int] = {e: 0 for e in active_exts}
        shared_color_layers = 0
        prev_last_ext: Optional[int] = None
        first_ext_id = (p_first_ext_idx + 1) if (p_first_ext_idx + 1) in active_exts else active_exts[0]

        for l_idx in range(num_layers):
            z_mid = (l_idx + 0.5) * lh
            layer_exts = sorted({
                iv["ext"] for iv in placed_intervals
                if (iv["z0"] - 0.02) <= z_mid <= (iv["z1"] + 0.02)
            })
            if not layer_exts:
                layer_exts = [active_exts[0]]

            if len(layer_exts) == 1:
                only_e = layer_exts[0]
                if prev_last_ext is not None and prev_last_ext != only_e:
                    swaps_per_ext[only_e] = swaps_per_ext.get(only_e, 0) + 1
                prev_last_ext = only_e
            else:
                shared_color_layers += 1
                if prev_last_ext is None:
                    start_e = first_ext_id if first_ext_id in layer_exts else layer_exts[-1]
                elif prev_last_ext in layer_exts:
                    start_e = prev_last_ext
                else:
                    start_e = layer_exts[0]
                    swaps_per_ext[start_e] = swaps_per_ext.get(start_e, 0) + 1

                remaining = [e for e in layer_exts if e != start_e]
                if (l_idx % 2 == 0) and first_ext_id in remaining:
                    remaining.remove(first_ext_id)
                    remaining.append(first_ext_id)
                elif (l_idx % 2 == 1) and len(layer_exts) >= 3:
                    pivot_b = layer_exts[-2] if layer_exts[-1] == first_ext_id else layer_exts[-1]
                    if pivot_b in remaining:
                        remaining.remove(pivot_b)
                        remaining.append(pivot_b)

                for e in remaining:
                    swaps_per_ext[e] = swaps_per_ext.get(e, 0) + 1
                prev_last_ext = remaining[-1] if remaining else start_e

        if shared_color_layers > 1 and len(active_exts) >= 3:
            first_active = active_exts[0]
            if swaps_per_ext.get(first_active, 0) == shared_color_layers:
                swaps_per_ext[first_active] -= 1
                pivot_b = active_exts[-2] if active_exts[-1] == first_ext_id else active_exts[-1]
                if pivot_b in swaps_per_ext:
                    swaps_per_ext[pivot_b] += 1

        total_swaps = sum(swaps_per_ext.values())

        nonzero_flush = [v for v in flush_matrix if v > 1.0]
        avg_flush_mm3 = (sum(nonzero_flush) / len(nonzero_flush)) if nonzero_flush else 280.0
        flush_g_per_swap = (avg_flush_mm3 * flush_multiplier / 1000.0) * 1.072

        filamentos_est = []
        total_modelo_g = 0.0
        total_desechos_g = 0.0
        total_torre_g = 0.0
        total_soporte_g = 0.0

        # Factor de espesor de pared según diámetro de boquilla (boquilla 0.6/0.8 hace paredes más gruesas)
        shell_ratio = min(0.85, 0.38 * (p_nozzle / 0.4))

        for idx_pos, ext_id in enumerate(active_exts):
            vol_cm3 = ext_vol_mm3.get(ext_id, 0.0) / 1000.0
            dens = cfg_densities[ext_id - 1] if (ext_id - 1) < len(cfg_densities) else 1.26
            c_hex = cfg_colors[ext_id - 1] if (ext_id - 1) < len(cfg_colors) else "#3b82f6"
            t_mat = cfg_types[ext_id - 1] if (ext_id - 1) < len(cfg_types) else "PLA"

            if vol_cm3 < 1.5:
                eff_factor = 1.0
            else:
                eff_factor = shell_ratio + ((1.0 - shell_ratio) * infill_ratio)
            model_g = vol_cm3 * dens * eff_factor

            support_g = 0.0
            if enable_support and idx_pos == 0:
                support_g = model_g * 0.415

            flushed_g = 0.0
            tower_g = 0.0
            ext_swaps = swaps_per_ext.get(ext_id, 0)

            if is_multicolor and enable_prime_tower:
                if shared_color_layers <= 1:
                    if idx_pos == 0:
                        flushed_g = 0.11
                        tower_g = max(0.3, (max_height_mm * 0.168) - flushed_g)
                    else:
                        flushed_g = 0.14 * max(1, ext_swaps)
                        tower_g = 0.09 * max(1, ext_swaps)
                else:
                    flushed_g = ext_swaps * flush_g_per_swap
                    prime_mm3 = prime_volumes[ext_id - 1] if (ext_id - 1) < len(prime_volumes) else 30.0
                    prime_g_per_swap = (prime_mm3 / 1000.0) * dens
                    tower_g = ext_swaps * prime_g_per_swap
                    if idx_pos == 0:
                        tower_g += 0.38

            total_ext_g = round(max(0.05, model_g + support_g + flushed_g + tower_g), 2)
            total_modelo_g += model_g
            total_soporte_g += support_g
            total_desechos_g += flushed_g
            total_torre_g += tower_g

            filamentos_est.append({
                "slicer_id": ext_id,
                "tipo": t_mat,
                "color_hex": c_hex,
                "gramos": total_ext_g,
                "modelo_g": round(model_g, 2),
                "desechos_g": round(flushed_g, 2),
                "torre_g": round(tower_g, 2),
                "soporte_g": round(support_g, 2),
                "cambios": ext_swaps
            })

        total_g_all = round(sum(f["gramos"] for f in filamentos_est), 2)

        # Velocidad volumétrica ajustada según diámetro de boquilla (0.2mm tarda más, 0.6/0.8mm tarda menos)
        nozzle_time_factor = ((0.4 / max(0.15, p_nozzle)) ** 1.35) * ((0.20 / max(0.06, lh)) ** 0.55)
        prep_min = 7.0
        print_min_by_weight = (total_modelo_g + total_soporte_g + total_torre_g) * 5.3 * nozzle_time_factor + (total_desechos_g * 2.0)

        eff_fl_time_s = p_fl_time_s
        if eff_fl_time_s <= 0.0 and ref_fl_s_per_mm3 > 0.0 and total_vol_plate_mm3 > 0.0:
            eff_fl_time_s = ref_fl_s_per_mm3 * total_vol_plate_mm3

        print_min_by_first_layer = 0.0
        if eff_fl_time_s > 10.0:
            fl_min = eff_fl_time_s / 60.0
            if shared_color_layers > 1:
                print_min_by_first_layer = fl_min * (1.0 + 0.50 * max(0, num_layers - 1))
            else:
                print_min_by_first_layer = fl_min * (1.0 + 0.18 * max(0, num_layers - 1))

        base_print_min = max(print_min_by_weight, print_min_by_first_layer)
        swap_min = (total_swaps * 0.92) if (is_multicolor and shared_color_layers > 1) else (total_swaps * 1.5 if is_multicolor else 0.0)
        minutos_est = round(max(8.0, prep_min + base_print_min + swap_min), 1)

        label_cama = f"Cama {pid}" + (f" ({pname})" if pname and pname.lower() != f"plate-{pid}" else "")
        return {
            "plate_id": pid,
            "nombre": label_cama,
            "nombre_cama": label_cama,
            "filamentos": filamentos_est,
            "g_por_tirada": total_g_all,
            "colores": len(filamentos_est),
            "minutos": minutos_est,
            "min_por_tirada_3d": minutos_est,
            "tiempo_str": _format_minutes_str(minutos_est),
            "objetos": max(1, total_piezas),
            "piezas_detectadas": max(1, total_piezas),
            "boquilla_mm": p_nozzle,
            "altura_capa_mm": p_lh,
            "tipo_placa": p_bed,
            "tiene_plate_json": p_fl_time_s > 0.0,
            "desglose_peso": {
                "modelo_g": round(total_modelo_g, 2),
                "desechos_g": round(total_desechos_g, 2),
                "torre_g": round(total_torre_g, 2),
                "soporte_g": round(total_soporte_g, 2),
                "cambios_filamento": total_swaps
            }
        }

    # Primero procesar las placas que sí tienen plate_X.json para calibrar ref_fl_s_per_mm3
    placas_con_json = [p for p in plates_definitions if p["plate_id"] in plate_json_info]
    placas_sin_json = [p for p in plates_definitions if p["plate_id"] not in plate_json_info]
    resultados_por_id: Dict[str, Dict[str, Any]] = {}
    for p_def in placas_con_json + placas_sin_json:
        resultados_por_id[p_def["plate_id"]] = _calcular_una_placa(p_def)

    camas_ordenadas = [resultados_por_id[p["plate_id"]] for p in plates_definitions]

    # Elegir como cama activa por defecto la que tenga plate_X.json (última laminada en Bambu Studio) o la Cama 1
    cama_activa = next((c for c in camas_ordenadas if c.get("tiene_plate_json")), camas_ordenadas[0])

    # Si hay más de 1 cama, crear también la opción "todas" (Proyecto completo sumando todas las camas)
    if len(camas_ordenadas) > 1:
        agg_fils: Dict[int, Dict[str, Any]] = {}
        agg_min = 0.0
        agg_objs = 0
        agg_mod = 0.0
        agg_des = 0.0
        agg_tor = 0.0
        agg_sop = 0.0
        agg_swp = 0
        for c in camas_ordenadas:
            agg_min += c["minutos"]
            agg_objs += c["objetos"]
            dp = c["desglose_peso"]
            agg_mod += dp["modelo_g"]
            agg_des += dp["desechos_g"]
            agg_tor += dp["torre_g"]
            agg_sop += dp["soporte_g"]
            agg_swp += dp["cambios_filamento"]
            for f in c["filamentos"]:
                sid = f["slicer_id"]
                if sid not in agg_fils:
                    agg_fils[sid] = dict(f)
                else:
                    agg_fils[sid]["gramos"] = round(agg_fils[sid]["gramos"] + f["gramos"], 2)
                    agg_fils[sid]["modelo_g"] = round(agg_fils[sid]["modelo_g"] + f["modelo_g"], 2)
                    agg_fils[sid]["desechos_g"] = round(agg_fils[sid]["desechos_g"] + f["desechos_g"], 2)
                    agg_fils[sid]["torre_g"] = round(agg_fils[sid]["torre_g"] + f["torre_g"], 2)
                    agg_fils[sid]["soporte_g"] = round(agg_fils[sid]["soporte_g"] + f["soporte_g"], 2)
                    agg_fils[sid]["cambios"] = agg_fils[sid]["cambios"] + f["cambios"]

        fils_todas = [agg_fils[k] for k in sorted(agg_fils.keys())]
        tot_g_todas = round(sum(x["gramos"] for x in fils_todas), 2)
        lbl_todas = f"📦 Todas las camas juntas ({len(plates_definitions)} camas)"
        camas_ordenadas.append({
            "plate_id": "todas",
            "nombre": lbl_todas,
            "nombre_cama": lbl_todas,
            "filamentos": fils_todas,
            "g_por_tirada": tot_g_todas,
            "colores": len(fils_todas),
            "minutos": round(agg_min, 1),
            "min_por_tirada_3d": round(agg_min, 1),
            "tiempo_str": _format_minutes_str(round(agg_min, 1)),
            "objetos": agg_objs,
            "piezas_detectadas": agg_objs,
            "boquilla_mm": cama_activa["boquilla_mm"],
            "altura_capa_mm": cama_activa["altura_capa_mm"],
            "tipo_placa": cama_activa["tipo_placa"],
            "tiene_plate_json": True,
            "desglose_peso": {
                "modelo_g": round(agg_mod, 2),
                "desechos_g": round(agg_des, 2),
                "torre_g": round(agg_tor, 2),
                "soporte_g": round(agg_sop, 2),
                "cambios_filamento": agg_swp
            }
        })

    return {
        "filamentos": cama_activa["filamentos"],
        "minutos": cama_activa["minutos"],
        "objetos": cama_activa["objetos"],
        "boquilla_mm": cama_activa["boquilla_mm"],
        "altura_capa_mm": cama_activa["altura_capa_mm"],
        "tipo_placa": cama_activa["tipo_placa"],
        "desglose_peso": cama_activa["desglose_peso"],
        "num_camas": len(plates_definitions),
        "cama_activa_id": cama_activa["plate_id"],
        "camas": camas_ordenadas
    }


def _vincular_filamentos_con_stock(filamentos_raw: List[Dict[str, Any]], stock_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    res = []
    for f in filamentos_raw:
        match = _match_stock_item(f["tipo"], f["color_hex"], stock_items)
        res.append({
            "slicer_id": f["slicer_id"],
            "tipo": f["tipo"],
            "color_hex": f["color_hex"],
            "gramos": f["gramos"],
            "modelo_g": f.get("modelo_g", f["gramos"]),
            "desechos_g": f.get("desechos_g", 0.0),
            "torre_g": f.get("torre_g", 0.0),
            "soporte_g": f.get("soporte_g", 0.0),
            "cambios": f.get("cambios", 0),
            "stock_match_id": match["id"] if match else (stock_items[0]["id"] if stock_items else 0),
            "stock_match_nombre": f"{match['tipo']} {match['color']}" if match else f["tipo"],
            "stock_match_hex": match["color_hex"] if match else f["color_hex"],
            "stock_disponible_g": match["stock_total_g"] if match else 0.0,
            "precio_kg": match["precio_kg_estimado"] if match else 20.0
        })
    return res


def analizar_archivo_slicer(filename: str, content: Union[bytes, BinaryIO], stock_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    clean_name = re.sub(r"(\.gcode\.3mf|\.3mf|\.gcode)$", "", filename or "Proyecto", flags=re.IGNORECASE).strip()
    filamentos_detectados: List[Dict[str, Any]] = []
    minutos_impresion = 0.0
    piezas_detectadas = 0
    es_estimacion_malla = False
    desglose_peso: Dict[str, Any] = {}
    boquilla_mm = 0.4
    altura_capa_mm = 0.2
    tipo_placa = "Textured PEI Plate"
    num_camas = 1
    cama_activa_id = "1"
    camas_lista: List[Dict[str, Any]] = []

    if isinstance(content, (bytes, bytearray)):
        magic = bytes(content[:4])
        file_obj: BinaryIO = io.BytesIO(content)
    else:
        content.seek(0)
        magic = content.read(4)
        content.seek(0)
        file_obj = content

    is_zip = magic == b"PK\x03\x04" or (filename and filename.lower().endswith(".3mf"))

    if is_zip:
        try:
            with zipfile.ZipFile(file_obj, "r") as zf:
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
                                elif k == "nozzle_diameters" and v:
                                    try:
                                        boquilla_mm = round(float(v.split(",")[0]), 2)
                                    except Exception:
                                        pass
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

                # 2. Buscar cualquier archivo .gcode dentro del .3mf si falta información (leyendo solo cabecera y cola)
                gcode_files = [n for n in names if n.lower().endswith(".gcode")]
                if gcode_files and (not filamentos_detectados or minutos_impresion == 0.0):
                    try:
                        with zf.open(gcode_files[0], "r") as gf:
                            head_bytes = gf.read(125000)
                            tail_chunks: List[bytes] = []
                            while True:
                                chunk = gf.read(65536)
                                if not chunk:
                                    break
                                tail_chunks.append(chunk)
                                if len(tail_chunks) > 3:
                                    tail_chunks.pop(0)
                            tail_bytes = b"".join(tail_chunks)[-125000:] if tail_chunks else b""
                        sample = (head_bytes + b"\n" + tail_bytes).decode("utf-8", errors="ignore")
                        parsed_gc = _parse_gcode_text(sample)
                        if not filamentos_detectados and parsed_gc["filamentos"]:
                            filamentos_detectados = parsed_gc["filamentos"]
                        if minutos_impresion == 0.0 and parsed_gc["minutos"] > 0:
                            minutos_impresion = parsed_gc["minutos"]
                        if parsed_gc.get("boquilla_mm"):
                            boquilla_mm = parsed_gc["boquilla_mm"]
                        if parsed_gc.get("altura_capa_mm"):
                            altura_capa_mm = parsed_gc["altura_capa_mm"]
                        if parsed_gc.get("tipo_placa"):
                            tipo_placa = parsed_gc["tipo_placa"]
                    except Exception:
                        pass

                # 3. Si es un proyecto .3mf sin G-code incrustado, analizar todas las camas, boquilla, partes multicolor, desechos y torre
                if not filamentos_detectados:
                    es_estimacion_malla = True
                    est = _estimar_desde_3mf_sin_laminar(zf)
                    filamentos_detectados = est["filamentos"]
                    desglose_peso = est.get("desglose_peso", {})
                    boquilla_mm = est.get("boquilla_mm", 0.4)
                    altura_capa_mm = est.get("altura_capa_mm", 0.2)
                    tipo_placa = est.get("tipo_placa", "Textured PEI Plate")
                    num_camas = est.get("num_camas", 1)
                    cama_activa_id = est.get("cama_activa_id", "1")
                    camas_lista = est.get("camas", [])
                    if minutos_impresion == 0.0:
                        minutos_impresion = est["minutos"]
                    if piezas_detectadas == 0:
                        piezas_detectadas = est["objetos"]
        except zipfile.BadZipFile:
            raise ValueError("El archivo .3mf está dañado o no es un archivo comprimido válido.")
    else:
        # Archivo .gcode directo (leemos solo cabecera y cola para ahorrar RAM)
        if isinstance(content, (bytes, bytearray)):
            if len(content) > 250000:
                sample = (content[:125000] + b"\n" + content[-125000:]).decode("utf-8", errors="ignore")
            else:
                sample = content.decode("utf-8", errors="ignore")
        else:
            file_obj.seek(0)
            head_b = file_obj.read(125000)
            file_obj.seek(0, io.SEEK_END)
            fsize = file_obj.tell()
            if fsize > 250000:
                file_obj.seek(max(0, fsize - 125000))
                tail_b = file_obj.read(125000)
                sample = (head_b + b"\n" + tail_b).decode("utf-8", errors="ignore")
            else:
                file_obj.seek(0)
                sample = file_obj.read().decode("utf-8", errors="ignore")
        parsed_gc = _parse_gcode_text(sample)
        filamentos_detectados = parsed_gc["filamentos"]
        minutos_impresion = parsed_gc["minutos"]
        if parsed_gc.get("boquilla_mm"):
            boquilla_mm = parsed_gc["boquilla_mm"]
        if parsed_gc.get("altura_capa_mm"):
            altura_capa_mm = parsed_gc["altura_capa_mm"]
        if parsed_gc.get("tipo_placa"):
            tipo_placa = parsed_gc["tipo_placa"]

    gc.collect()

    if not filamentos_detectados:
        raise ValueError("No se encontraron datos de filamento en el archivo. Asegúrate de subir un .gcode o .3mf exportado desde Bambu Studio / OrcaSlicer.")

    filamentos_con_stock = _vincular_filamentos_con_stock(filamentos_detectados, stock_items)
    for c in camas_lista:
        c["filamentos"] = _vincular_filamentos_con_stock(c["filamentos"], stock_items)

    total_g = round(sum(x["gramos"] for x in filamentos_con_stock), 2)
    num_colores = max(1, len(filamentos_con_stock))
    if minutos_impresion <= 0:
        minutos_impresion = max(15.0, round(total_g * 2.5, 0))

    tiempo_str = _format_minutes_str(minutos_impresion)

    return {
        "nombre_proyecto": clean_name,
        "g_por_tirada": total_g,
        "colores": num_colores,
        "min_por_tirada_3d": round(minutos_impresion, 1),
        "tiempo_str": tiempo_str,
        "piezas_detectadas": piezas_detectadas,
        "es_estimacion_malla": es_estimacion_malla,
        "boquilla_mm": boquilla_mm,
        "altura_capa_mm": altura_capa_mm,
        "tipo_placa": tipo_placa,
        "num_camas": num_camas,
        "cama_activa_id": cama_activa_id,
        "camas": camas_lista,
        "desglose_peso": desglose_peso,
        "filamentos": filamentos_con_stock
    }

