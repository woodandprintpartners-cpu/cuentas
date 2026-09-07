import os
import json
from app.database import init_db, execute_query, guess_hex_color, get_all_pedidos

DATA_JSON = os.path.join(os.path.dirname(__file__), "initial_data.json")

def seed_database():
    init_db()
    
    # Check if already seeded
    pedidos = get_all_pedidos()
    if len(pedidos) > 0:
        print(f"Base de datos ya contiene {len(pedidos)} pedidos. Omitiendo seed.")
        return

    print("Inicializando base de datos con datos de Excel...")
    if not os.path.exists(DATA_JSON):
        print("No se encontró initial_data.json.")
        return
        
    with open(DATA_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    # 1. Insertar Pedidos
    for p in data.get("pedidos", []):
        sql = """
        INSERT INTO pedidos (
            id, titulo, cliente, fecha, unidades, precio_unidad, precio_total,
            pct_ci, gastos_indirectos, beneficio, quien_hace, quien_cobra
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            p["id"], p["titulo"], p["cliente"], p["fecha"],
            p["unidades"], p["precio_unidad"], p["precio_total"],
            p["pct_ci"], p["gastos_indirectos"], p["beneficio"],
            p["quien_hace"], p["quien_cobra"]
        )
        execute_query(sql, params, commit=True)
        
    # 2. Insertar Gastos Material
    for m in data.get("gastos_material", []):
        sql = """
        INSERT INTO gastos_material (concepto, fecha, precio, pagado_por, enlace, categoria)
        VALUES (?, ?, ?, ?, ?, ?)
        """
        params = (
            m["concepto"], m["fecha"], m["precio"], m["pagado_por"], m.get("enlace", ""), "filamento"
        )
        execute_query(sql, params, commit=True)
        
    # 3. Insertar Gastos Maquinaria
    for q in data.get("gastos_maquinaria", []):
        sql = """
        INSERT INTO gastos_maquinaria (concepto, fecha, precio, pagado_por, enlace, es_inicial)
        VALUES (?, ?, ?, ?, ?, ?)
        """
        params = (
            q["concepto"], q["fecha"], q["precio"], q["pagado_por"], q.get("enlace", ""), False
        )
        execute_query(sql, params, commit=True)
        
    # 4. Insertar Stock Materiales
    for s in data.get("materiales_stock", []):
        color = s["color"]
        sql = """
        INSERT INTO materiales_stock (
            tipo, color, color_hex, stock_total_g, pablo_g, javi_g,
            pablo_rollos_json, javi_rollos_json, precio_kg_estimado, alerta_minimo_g
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        params = (
            s["tipo"], color, guess_hex_color(color),
            s["stock_total_g"], s["pablo_g"], s["javi_g"],
            json.dumps(s.get("pablo_rollos", [])),
            json.dumps(s.get("javi_rollos", [])),
            20.0, 200.0
        )
        execute_query(sql, params, commit=True)
        
    # 5. Insertar Fornituras
    for fo in data.get("fornituras", []):
        sql = """
        INSERT INTO fornituras (nombre, cantidad, unidades, coste_unitario)
        VALUES (?, ?, ?, ?)
        """
        params = (
            fo["nombre"], fo["cantidad"], fo["unidades"], 0.10
        )
        execute_query(sql, params, commit=True)
        
    print("Base de datos poblada exitosamente!")

if __name__ == "__main__":
    seed_database()
