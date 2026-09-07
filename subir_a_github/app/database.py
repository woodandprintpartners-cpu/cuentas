import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

DATABASE_URL = os.environ.get("DATABASE_URL")
IS_POSTGRES = bool(DATABASE_URL and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")))

if IS_POSTGRES:
    # Fix postgres:// prefix for SQLAlchemy / psycopg2 if needed
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    import psycopg2
    from psycopg2.extras import RealDictCursor

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "w_and_p.db")

def get_connection():
    if IS_POSTGRES:
        return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def adapt_sql(sql: str) -> str:
    if not IS_POSTGRES:
        return sql
    # Convert parameters from ? to %s
    sql = sql.replace("?", "%s")
    sql = sql.replace("AUTOINCREMENT", "")
    sql = sql.replace("GLOB '[0-9][0-9][0-9]'", "~ '^[0-9]{3}$'")
    return sql

def execute_query(sql: str, params: tuple = (), fetchone: bool = False, fetchall: bool = False, commit: bool = False):
    conn = get_connection()
    try:
        cur = conn.cursor()
        adapted = adapt_sql(sql)
        cur.execute(adapted, params)
        res = None
        if fetchone:
            r = cur.fetchone()
            res = dict(r) if r else None
        elif fetchall:
            rows = cur.fetchall()
            res = [dict(r) for r in rows]
        if commit:
            conn.commit()
        return res
    finally:
        conn.close()

def init_db():
    conn = get_connection()
    try:
        c = conn.cursor()
        auto_id = "SERIAL PRIMARY KEY" if IS_POSTGRES else "INTEGER PRIMARY KEY AUTOINCREMENT"
        
        # 1. Pedidos
        c.execute(adapt_sql("""
        CREATE TABLE IF NOT EXISTS pedidos (
            id TEXT PRIMARY KEY,
            titulo TEXT NOT NULL,
            cliente TEXT NOT NULL,
            fecha TEXT,
            unidades REAL DEFAULT 0,
            precio_unidad REAL DEFAULT 0,
            precio_total REAL DEFAULT 0,
            pct_ci REAL DEFAULT 0.20,
            gastos_indirectos REAL DEFAULT 0,
            beneficio REAL DEFAULT 0,
            quien_hace TEXT DEFAULT 'J',
            quien_cobra TEXT DEFAULT 'X',
            notas TEXT DEFAULT '',
            detalles_json TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """))
        
        # 2. Gastos Material
        c.execute(adapt_sql(f"""
        CREATE TABLE IF NOT EXISTS gastos_material (
            id {auto_id},
            concepto TEXT NOT NULL,
            fecha TEXT,
            precio REAL NOT NULL,
            pagado_por TEXT NOT NULL,
            enlace TEXT DEFAULT '',
            categoria TEXT DEFAULT 'filamento',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """))
        
        # 3. Gastos Maquinaria
        c.execute(adapt_sql(f"""
        CREATE TABLE IF NOT EXISTS gastos_maquinaria (
            id {auto_id},
            concepto TEXT NOT NULL,
            fecha TEXT,
            precio REAL NOT NULL,
            pagado_por TEXT NOT NULL,
            enlace TEXT DEFAULT '',
            es_inicial BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """))
        
        # 4. Stock Materiales
        c.execute(adapt_sql(f"""
        CREATE TABLE IF NOT EXISTS materiales_stock (
            id {auto_id},
            tipo TEXT NOT NULL,
            color TEXT NOT NULL,
            color_hex TEXT DEFAULT '#64748b',
            stock_total_g REAL DEFAULT 0,
            pablo_g REAL DEFAULT 0,
            javi_g REAL DEFAULT 0,
            pablo_rollos_json TEXT DEFAULT '[]',
            javi_rollos_json TEXT DEFAULT '[]',
            precio_kg_estimado REAL DEFAULT 20.0,
            alerta_minimo_g REAL DEFAULT 200.0
        )
        """))
        
        # 5. Fornituras
        c.execute(adapt_sql(f"""
        CREATE TABLE IF NOT EXISTS fornituras (
            id {auto_id},
            nombre TEXT NOT NULL,
            cantidad REAL DEFAULT 0,
            unidades TEXT DEFAULT 'ud',
            coste_unitario REAL DEFAULT 0.0
        )
        """))
        
        conn.commit()
    finally:
        conn.close()

# Helper Color Hex
COLOR_MAP = {
    "negro": "#1e293b",
    "gris oscuro": "#475569",
    "blanco": "#f8fafc",
    "verde pastel": "#86efac",
    "azul pastel": "#93c5fd",
    "naranja": "#fb923c",
    "rojo burdeos": "#991b1b",
    "oro viejo": "#b45309",
    "oro joven": "#eab308",
    "beig": "#f5d0fe",
    "blanco frío": "#f1f5f9",
    "gris claro": "#cbd5e1",
    "amarillo": "#facc15",
    "transparente": "#e2e8f0",
    "azul oscuro": "#1e3a8a",
    "azul celeste": "#38bdf8",
    "marrón": "#78350f",
    "rosa": "#f472b6"
}

def guess_hex_color(color_name: str) -> str:
    color_clean = color_name.lower().strip()
    for key, hex_val in COLOR_MAP.items():
        if key in color_clean:
            return hex_val
    return "#64748b"

# --- OPERACIONES PEDIDOS ---
def get_all_pedidos(filtro_estado: Optional[str] = None, query: Optional[str] = None) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM pedidos WHERE 1=1"
    params = []
    
    if filtro_estado:
        sql += " AND UPPER(quien_cobra) = ?"
        params.append(filtro_estado.upper())
        
    if query:
        sql += " AND (titulo LIKE ? OR cliente LIKE ? OR id LIKE ?)"
        like_q = f"%{query}%"
        params.extend([like_q, like_q, like_q])
        
    sql += " ORDER BY id DESC"
    return execute_query(sql, tuple(params), fetchall=True) or []

def get_pedido(pedido_id: str) -> Optional[Dict[str, Any]]:
    return execute_query("SELECT * FROM pedidos WHERE id = ?", (pedido_id,), fetchone=True)

def create_pedido(data: Dict[str, Any]) -> Dict[str, Any]:
    pid = str(data.get("id", "")).strip()
    if not pid or pid.lower() == "nuevo":
        # Search next numeric ID
        row = execute_query("SELECT id FROM pedidos WHERE id GLOB '[0-9][0-9][0-9]' ORDER BY id DESC LIMIT 1", fetchone=True)
        if row:
            next_num = int(row["id"]) + 1
            pid = f"{next_num:03d}"
        else:
            pid = "026"
            
    precio_total = float(data.get("precio_total", 0.0))
    pct_ci = float(data.get("pct_ci", 0.20))
    gastos_ind = precio_total * pct_ci
    beneficio = precio_total - gastos_ind
    
    # Check if exists (for upsert support across SQLite and Postgres)
    existing = get_pedido(pid)
    if existing:
        return update_pedido(pid, data)
        
    sql = """
    INSERT INTO pedidos (
        id, titulo, cliente, fecha, unidades, precio_unidad, precio_total,
        pct_ci, gastos_indirectos, beneficio, quien_hace, quien_cobra, notas, detalles_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    params = (
        pid,
        data.get("titulo", "Nuevo Pedido"),
        data.get("cliente", "Cliente"),
        data.get("fecha", datetime.today().strftime("%Y-%m-%d")),
        float(data.get("unidades", 1)),
        float(data.get("precio_unidad", 0)),
        precio_total,
        pct_ci,
        gastos_ind,
        beneficio,
        str(data.get("quien_hace", "J")).upper(),
        str(data.get("quien_cobra", "X")).upper(),
        data.get("notas", ""),
        data.get("detalles_json", "")
    )
    execute_query(sql, params, commit=True)
    return get_pedido(pid)

def update_pedido(pedido_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    precio_total = float(data.get("precio_total", 0.0))
    pct_ci = float(data.get("pct_ci", 0.20))
    gastos_ind = precio_total * pct_ci
    beneficio = precio_total - gastos_ind
    
    sql = """
    UPDATE pedidos SET
        titulo = ?, cliente = ?, fecha = ?, unidades = ?, precio_unidad = ?,
        precio_total = ?, pct_ci = ?, gastos_indirectos = ?, beneficio = ?,
        quien_hace = ?, quien_cobra = ?, notas = ?
    WHERE id = ?
    """
    params = (
        data.get("titulo", ""),
        data.get("cliente", ""),
        data.get("fecha", ""),
        float(data.get("unidades", 0)),
        float(data.get("precio_unidad", 0)),
        precio_total,
        pct_ci,
        gastos_ind,
        beneficio,
        str(data.get("quien_hace", "J")).upper(),
        str(data.get("quien_cobra", "X")).upper(),
        data.get("notas", ""),
        pedido_id
    )
    execute_query(sql, params, commit=True)
    return get_pedido(pedido_id)

def delete_pedido(pedido_id: str) -> bool:
    execute_query("DELETE FROM pedidos WHERE id = ?", (pedido_id,), commit=True)
    return True

# --- OPERACIONES GASTOS MATERIAL ---
def get_gastos_material() -> List[Dict[str, Any]]:
    return execute_query("SELECT * FROM gastos_material ORDER BY fecha DESC, id DESC", fetchall=True) or []

def add_gasto_material(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        sql = adapt_sql("""
        INSERT INTO gastos_material (concepto, fecha, precio, pagado_por, enlace, categoria)
        VALUES (?, ?, ?, ?, ?, ?)
        """)
        params = (
            data.get("concepto", ""),
            data.get("fecha", datetime.today().strftime("%Y-%m-%d")),
            float(data.get("precio", 0.0)),
            str(data.get("pagado_por", "P")).upper(),
            data.get("enlace", ""),
            data.get("categoria", "filamento")
        )
        cur.execute(sql, params)
        conn.commit()
        if IS_POSTGRES:
            cur.execute("SELECT * FROM gastos_material ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
        else:
            gid = cur.lastrowid
            cur.execute("SELECT * FROM gastos_material WHERE id = ?", (gid,))
            row = cur.fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()

def delete_gasto_material(gasto_id: int) -> bool:
    execute_query("DELETE FROM gastos_material WHERE id = ?", (gasto_id,), commit=True)
    return True

# --- OPERACIONES GASTOS MAQUINARIA ---
def get_gastos_maquinaria() -> List[Dict[str, Any]]:
    return execute_query("SELECT * FROM gastos_maquinaria ORDER BY fecha DESC, id DESC", fetchall=True) or []

def add_gasto_maquinaria(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        sql = adapt_sql("""
        INSERT INTO gastos_maquinaria (concepto, fecha, precio, pagado_por, enlace, es_inicial)
        VALUES (?, ?, ?, ?, ?, ?)
        """)
        params = (
            data.get("concepto", ""),
            data.get("fecha", datetime.today().strftime("%Y-%m-%d")),
            float(data.get("precio", 0.0)),
            str(data.get("pagado_por", "P")).upper(),
            data.get("enlace", ""),
            True if data.get("es_inicial") else False
        )
        cur.execute(sql, params)
        conn.commit()
        if IS_POSTGRES:
            cur.execute("SELECT * FROM gastos_maquinaria ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
        else:
            gid = cur.lastrowid
            cur.execute("SELECT * FROM gastos_maquinaria WHERE id = ?", (gid,))
            row = cur.fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()

def delete_gasto_maquinaria(gasto_id: int) -> bool:
    execute_query("DELETE FROM gastos_maquinaria WHERE id = ?", (gasto_id,), commit=True)
    return True

# --- OPERACIONES STOCK ---
def get_all_stock() -> List[Dict[str, Any]]:
    rows = execute_query("SELECT * FROM materiales_stock ORDER BY tipo ASC, color ASC", fetchall=True) or []
    res = []
    for r in rows:
        d = dict(r)
        d["pablo_rollos"] = json.loads(d.get("pablo_rollos_json") or "[]")
        d["javi_rollos"] = json.loads(d.get("javi_rollos_json") or "[]")
        res.append(d)
    return res

def update_stock_item(stock_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pablo_g = float(data.get("pablo_g", 0.0))
    javi_g = float(data.get("javi_g", 0.0))
    stock_total_g = pablo_g + javi_g
    
    sql = """
    UPDATE materiales_stock SET
        tipo = ?, color = ?, color_hex = ?, stock_total_g = ?,
        pablo_g = ?, javi_g = ?, precio_kg_estimado = ?, alerta_minimo_g = ?
    WHERE id = ?
    """
    params = (
        data.get("tipo", "PLA"),
        data.get("color", ""),
        data.get("color_hex", guess_hex_color(data.get("color", ""))),
        stock_total_g,
        pablo_g,
        javi_g,
        float(data.get("precio_kg_estimado", 20.0)),
        float(data.get("alerta_minimo_g", 200.0)),
        stock_id
    )
    execute_query(sql, params, commit=True)
    return execute_query("SELECT * FROM materiales_stock WHERE id = ?", (stock_id,), fetchone=True)

def descontar_stock(stock_id: int, gramos: float, socio: str) -> Optional[Dict[str, Any]]:
    row = execute_query("SELECT * FROM materiales_stock WHERE id = ?", (stock_id,), fetchone=True)
    if not row:
        return None
        
    pablo_g = float(row["pablo_g"])
    javi_g = float(row["javi_g"])
    socio = socio.upper().strip()
    
    if socio == "P":
        pablo_g = max(0.0, pablo_g - gramos)
    elif socio == "J":
        javi_g = max(0.0, javi_g - gramos)
    else:
        mitad = gramos / 2.0
        pablo_g = max(0.0, pablo_g - mitad)
        javi_g = max(0.0, javi_g - mitad)
        
    total_g = pablo_g + javi_g
    sql = "UPDATE materiales_stock SET pablo_g = ?, javi_g = ?, stock_total_g = ? WHERE id = ?"
    execute_query(sql, (pablo_g, javi_g, total_g, stock_id), commit=True)
    return {"id": stock_id, "pablo_g": pablo_g, "javi_g": javi_g, "stock_total_g": total_g}

# --- FORNITURAS ---
def get_all_fornituras() -> List[Dict[str, Any]]:
    return execute_query("SELECT * FROM fornituras ORDER BY id ASC", fetchall=True) or []

def update_fornitura(fornitura_id: int, cantidad: float) -> Optional[Dict[str, Any]]:
    execute_query("UPDATE fornituras SET cantidad = ? WHERE id = ?", (cantidad, fornitura_id), commit=True)
    return execute_query("SELECT * FROM fornituras WHERE id = ?", (fornitura_id,), fetchone=True)

# --- BALANCE Y LIQUIDACIÓN ---
def get_balance_financiero() -> Dict[str, Any]:
    pedidos = execute_query("SELECT * FROM pedidos", fetchall=True) or []
    total_ingresos = 0.0
    cobrado_javi = 0.0
    cobrado_pablo = 0.0
    cobrado_comun = 0.0
    pendiente_cobro = 0.0
    
    total_gastos_indirectos = 0.0
    gi_javi = 0.0
    gi_pablo = 0.0
    gi_comun = 0.0
    
    pedidos_pendientes_lista = []
    
    for p in pedidos:
        pt = float(p["precio_total"] or 0)
        gi = float(p["gastos_indirectos"] or 0)
        total_ingresos += pt
        total_gastos_indirectos += gi
        
        qc = str(p["quien_cobra"] or "").strip().upper()
        qh = str(p["quien_hace"] or "").strip().upper()
        
        if qc == "J":
            cobrado_javi += pt
        elif qc == "P":
            cobrado_pablo += pt
        elif qc == "W":
            cobrado_comun += pt
        elif qc == "X":
            pendiente_cobro += pt
            pedidos_pendientes_lista.append(dict(p))
            
        if qh == "J":
            gi_javi += gi
        elif qh == "P":
            gi_pablo += gi
        else:
            gi_comun += gi
            
    # Gastos Material
    gastos_mat = execute_query("SELECT * FROM gastos_material", fetchall=True) or []
    gmat_total = 0.0
    gmat_pablo = 0.0
    gmat_javi = 0.0
    gmat_empresa = 0.0
    
    for g in gastos_mat:
        pr = float(g["precio"] or 0)
        gmat_total += pr
        pg = str(g["pagado_por"] or "").strip().upper()
        if pg == "P":
            gmat_pablo += pr
        elif pg == "J":
            gmat_javi += pr
        elif "W" in pg:
            gmat_empresa += pr
            
    # Gastos Maquinaria
    gastos_maq = execute_query("SELECT * FROM gastos_maquinaria", fetchall=True) or []
    gmaq_total = 0.0
    gmaq_pablo = 0.0
    gmaq_javi = 0.0
    gmaq_empresa = 0.0
    
    for m in gastos_maq:
        pr = float(m["precio"] or 0)
        gmaq_total += pr
        pg = str(m["pagado_por"] or "").strip().upper()
        if pg == "P":
            gmaq_pablo += pr
        elif pg == "J":
            gmaq_javi += pr
        elif "W" in pg:
            gmaq_empresa += pr
            
    dinero_neto_pablo = cobrado_pablo - gmat_pablo
    dinero_neto_javi = cobrado_javi - gmat_javi
    
    beneficio_repartible = dinero_neto_pablo + dinero_neto_javi
    cuota_50_50 = beneficio_repartible / 2.0
    
    diferencia = dinero_neto_pablo - cuota_50_50
    if diferencia > 0.01:
        quien_debe = "Pablo"
        a_quien = "Javi"
        cantidad_a_transferir = round(diferencia, 2)
        mensaje_liquidacion = f"Pablo debe transferir a Javi {cantidad_a_transferir:.2f} € para igualar beneficios y compensar materiales."
    elif diferencia < -0.01:
        quien_debe = "Javi"
        a_quien = "Pablo"
        cantidad_a_transferir = round(abs(diferencia), 2)
        mensaje_liquidacion = f"Javi debe transferir a Pablo {cantidad_a_transferir:.2f} € para igualar beneficios y compensar materiales."
    else:
        quien_debe = None
        a_quien = None
        cantidad_a_transferir = 0.0
        mensaje_liquidacion = "¡Cuentas al día! Ambos socios están exactamente al 50% de beneficios netos."
        
    return {
        "ingresos": {
            "total_facturado": round(total_ingresos, 2),
            "cobrado_javi": round(cobrado_javi, 2),
            "cobrado_pablo": round(cobrado_pablo, 2),
            "cobrado_comun": round(cobrado_comun, 2),
            "pendiente_cobro": round(pendiente_cobro, 2)
        },
        "gastos_material": {
            "total": round(gmat_total, 2),
            "pablo": round(gmat_pablo, 2),
            "javi": round(gmat_javi, 2),
            "empresa": round(gmat_empresa, 2)
        },
        "gastos_maquinaria": {
            "total": round(gmaq_total, 2),
            "pablo": round(gmaq_pablo, 2),
            "javi": round(gmaq_javi, 2),
            "empresa": round(gmaq_empresa, 2)
        },
        "fondo_indirectos": {
            "total_acumulado": round(total_gastos_indirectos, 2),
            "javi": round(gi_javi, 2),
            "pablo": round(gi_pablo, 2),
            "comun": round(gi_comun, 2)
        },
        "liquidacion": {
            "dinero_neto_pablo": round(dinero_neto_pablo, 2),
            "dinero_neto_javi": round(dinero_neto_javi, 2),
            "beneficio_neto_total": round(beneficio_repartible, 2),
            "cuota_ideal_cada_uno": round(cuota_50_50, 2),
            "quien_debe": quien_debe,
            "a_quien": a_quien,
            "cantidad_a_transferir": cantidad_a_transferir,
            "mensaje": mensaje_liquidacion
        },
        "pedidos_pendientes": pedidos_pendientes_lista
    }
