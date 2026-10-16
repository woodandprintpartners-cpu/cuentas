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
    tipos_mat: List[str] = []
    minutos = 0.0
    total_g_direct = 0.0

    for line in text.splitlines():
        line_s = line.strip()
        if not line_s.startswith(";"):
            continue

        # Gramos por extrusor/filamento: ; filament used [g] = 12.34, 5.67
        m_g = re.match(r"^;\s*filament used \[g\]\s*=\s*(.+)$", line_s, re.IGNORECASE)
        if m_g:
            parts = [p.strip() for p in re.split(r"[,;]", m_g.group(1)) if p.strip()]
            try:
                filamentos_g = [float(x) for x in parts]
            except ValueError:
                pass

        m_tot_g = re.match(r"^;\s*total filament used \[g\]\s*=\s*([\d\.]+)", line_s, re.IGNORECASE)
        if m_tot_g:
            try:
                total_g_direct = float(m_tot_g.group(1))
            except ValueError:
                pass

        # Colores: ; filament_colour = #FF0000;#00FF00 o ; extruder_colour = ...
        m_col = re.match(r"^;\s*(?:filament_colour|extruder_colour)\s*=\s*(.+)$", line_s, re.IGNORECASE)
        if m_col and not colores_hex:
            parts = [p.strip() for p in re.split(r"[;,]", m_col.group(1)) if p.strip()]
            colores_hex = [_normalize_hex(p) for p in parts]

        # Tipos: ; filament_type = PLA;PLA;PETG
        m_type = re.match(r"^;\s*filament_type\s*=\s*(.+)$", line_s, re.IGNORECASE)
        if m_type and not tipos_mat:
            tipos_mat = [p.strip() for p in re.split(r"[;,]", m_type.group(1)) if p.strip()]

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

def _calcular_volumen_malla_3mf(zf: zipfile.ZipFile) -> Dict[str, Any]:
    """Calcula el volumen real en cm³ y nº de objetos a partir de la malla 3D si el .3mf aún no está laminado."""
    total_vol_mm3 = 0.0
    objetos_count = 0

    model_files = [n for n in zf.namelist() if n.lower().endswith(".model")]
    for mf in model_files:
        try:
            raw_xml = zf.read(mf)
            root = ET.fromstring(raw_xml)
            for elem in root.iter():
                tag = elem.tag.split("}")[-1].lower()
                if tag == "mesh":
                    objetos_count += 1
                    verts = []
                    v_parent = None
                    t_parent = None
                    for child in elem:
                        ctag = child.tag.split("}")[-1].lower()
                        if ctag == "vertices":
                            v_parent = child
                        elif ctag == "triangles":
                            t_parent = child
                    if v_parent is not None and t_parent is not None:
                        for v in v_parent:
                            verts.append((
                                float(v.attrib.get("x", 0.0)),
                                float(v.attrib.get("y", 0.0)),
                                float(v.attrib.get("z", 0.0))
                            ))
                        mesh_vol = 0.0
                        for t in t_parent:
                            i1 = int(t.attrib.get("v1", 0))
                            i2 = int(t.attrib.get("v2", 0))
                            i3 = int(t.attrib.get("v3", 0))
                            if i1 < len(verts) and i2 < len(verts) and i3 < len(verts):
                                p1, p2, p3 = verts[i1], verts[i2], verts[i3]
                                # Volumen signado del tetraedro
                                v321 = p3[0] * p2[1] * p1[2]
                                v231 = p2[0] * p3[1] * p1[2]
                                v312 = p3[0] * p1[1] * p2[2]
                                v132 = p1[0] * p3[1] * p2[2]
                                v213 = p2[0] * p1[1] * p3[2]
                                v123 = p1[0] * p2[1] * p3[2]
                                mesh_vol += (1.0 / 6.0) * (-v321 + v231 + v312 - v132 - v213 + v123)
                        total_vol_mm3 += abs(mesh_vol)
        except Exception:
            continue

    vol_cm3 = total_vol_mm3 / 1000.0
    return {"volumen_cm3": round(vol_cm3, 2), "objetos": max(1, objetos_count)}


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

                # 1. Intentar leer Metadata/slice_info.config (Bambu Studio / OrcaSlicer)
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
                        if len(raw_gc) > 200000:
                            sample = (raw_gc[:100000] + b"\n" + raw_gc[-100000:]).decode("utf-8", errors="ignore")
                        else:
                            sample = raw_gc.decode("utf-8", errors="ignore")
                        parsed_gc = _parse_gcode_text(sample)
                        if not filamentos_detectados and parsed_gc["filamentos"]:
                            filamentos_detectados = parsed_gc["filamentos"]
                        if minutos_impresion == 0.0 and parsed_gc["minutos"] > 0:
                            minutos_impresion = parsed_gc["minutos"]
                    except Exception:
                        pass

                # 3. Si es un .3mf de geometría sin laminar todavía, estimar desde la malla 3D + project_settings.config
                if not filamentos_detectados:
                    es_estimacion_malla = True
                    cfg_colors = []
                    cfg_types = []
                    proj_cfg = [n for n in names if n.lower().endswith("project_settings.config")]
                    if proj_cfg:
                        try:
                            jdata = json.loads(zf.read(proj_cfg[0]).decode("utf-8", errors="ignore"))
                            cfg_colors = [_normalize_hex(c) for c in jdata.get("filament_colour", []) if c]
                            cfg_types = [t for t in jdata.get("filament_type", []) if t]
                        except Exception:
                            pass

                    mesh_info = _calcular_volumen_malla_3mf(zf)
                    vol_cm3 = mesh_info["volumen_cm3"]
                    if piezas_detectadas == 0:
                        piezas_detectadas = mesh_info["objetos"]
                    # Densidad efectiva media (paredes + relleno ~55% de 1.24 g/cm³ = 0.68 g/cm³)
                    gramos_est = max(1.0, round(vol_cm3 * 0.68, 1))
                    if minutos_impresion == 0.0:
                        minutos_impresion = max(10.0, round(gramos_est * 2.5, 0))

                    filamentos_detectados.append({
                        "slicer_id": 1,
                        "tipo": cfg_types[0] if cfg_types else "PLA",
                        "color_hex": cfg_colors[0] if cfg_colors else "#3b82f6",
                        "gramos": gramos_est
                    })
        except zipfile.BadZipFile:
            raise ValueError("El archivo .3mf está dañado o no es un archivo comprimido válido.")
    else:
        # Archivo .gcode directo
        if len(content) > 250000:
            sample = (content[:120000] + b"\n" + content[-120000:]).decode("utf-8", errors="ignore")
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

