import os
import json
from app.database import init_db, get_db, guess_hex_color

DATA_JSON = os.path.join(os.path.dirname(__file__), "initial_data.json")

def seed_database():
    init_db()
    conn = get_db()
    
    # Check if already seeded
    count = conn.execute("SELECT COUNT(*) as cnt FROM pedidos").fetchone()["cnt"]
    if count > 0:
        print(f"Base de datos ya contiene {count} pedidos. Omitiendo seed.")
        conn.close()
        return

    print("Inicializando base de datos con datos de Excel...")
    if not os.path.exists(DATA_JSON):
        print("No se encontró initial_data.json.")
        conn.close()
        return
        
    with open(DATA_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # 1. Insertar Pedidos
    for p in data.get("pedidos", []):
        conn.execute("""
        INSERT OR REPLACE INTO pedidos (
            id, titulo, cliente, fecha, unidades, precio_unidad, precio_total,
            pct_ci, gastos_indirectos, beneficio, quien_hace, quien_cobra
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            p["id"], p["titulo"], p["cliente"], p["fecha"],
            p["unidades"], p["precio_unidad"], p["precio_total"],
            p["pct_ci"], p["gastos_indirectos"], p["beneficio"],
            p["quien_hace"], p["quien_cobra"]
        ))
        
    # 2. Insertar Gastos Material
    for m in data.get("gastos_material", []):
        conn.execute("""
        INSERT INTO gastos_material (concepto, fecha, precio, pagado_por, enlace, categoria)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            m["concepto"], m["fecha"], m["precio"], m["pagado_por"], m.get("enlace", ""), "filamento"
        ))
        
    # 3. Insertar Gastos Maquinaria
    for q in data.get("gastos_maquinaria", []):
        conn.execute("""
        INSERT INTO gastos_maquinaria (concepto, fecha, precio, pagado_por, enlace, es_inicial)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            q["concepto"], q["fecha"], q["precio"], q["pagado_por"], q.get("enlace", ""), 0
        ))
        
    # 4. Insertar Stock Materiales
    for s in data.get("materiales_stock", []):
        color = s["color"]
        conn.execute("""
        INSERT INTO materiales_stock (
            tipo, color, color_hex, stock_total_g, pablo_g, javi_g,
            pablo_rollos_json, javi_rollos_json, precio_kg_estimado, alerta_minimo_g
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            s["tipo"], color, guess_hex_color(color),
            s["stock_total_g"], s["pablo_g"], s["javi_g"],
            json.dumps(s.get("pablo_rollos", [])),
            json.dumps(s.get("javi_rollos", [])),
            20.0, 200.0
        ))
        
    # 5. Insertar Fornituras
    for fo in data.get("fornituras", []):
        conn.execute("""
        INSERT INTO fornituras (nombre, cantidad, unidades, coste_unitario)
        VALUES (?, ?, ?, ?)
        """, (
            fo["nombre"], fo["cantidad"], fo["unidades"], 0.10
        ))
        
    conn.commit()
    conn.close()
    print("Base de datos poblada exitosamente!")

if __name__ == "__main__":
    seed_database()
