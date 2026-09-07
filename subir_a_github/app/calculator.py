import math
from typing import Optional
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
