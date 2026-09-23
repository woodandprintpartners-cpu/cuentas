import os
import shutil
import zipfile

def sync_to_subir_a_github(base_dir):
    dest_dir = os.path.join(base_dir, "subir_a_github")
    os.makedirs(dest_dir, exist_ok=True)
    
    # Sync files
    files_to_copy = ["requirements.txt", "render.yaml", "run.py", "iniciar_app.bat", "export_for_cloud.py"]
    for f in files_to_copy:
        src = os.path.join(base_dir, f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(dest_dir, f))
            
    # Sync app directory
    src_app = os.path.join(base_dir, "app")
    dest_app = os.path.join(dest_dir, "app")
    if os.path.exists(dest_app):
        shutil.rmtree(dest_app)
    shutil.copytree(src_app, dest_app, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    print("[OK] Carpeta 'subir_a_github' sincronizada con la última versión.")

def create_cloud_zip():
    base_dir = os.path.dirname(__file__)
    sync_to_subir_a_github(base_dir)
    
    zip_path = os.path.join(base_dir, "wp_workshop_cloud.zip")
    
    ignore_patterns = [
        "__pycache__", ".git", ".db", ".xlsx", "test_app.py",
        "wp_workshop_cloud.zip", "test_crud.py", ".pyc", "subir_a_github"
    ]
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = [d for d in dirs if not any(p in d for p in ["__pycache__", ".git", "subir_a_github"])]
            for file in files:
                if any(p in file for p in ignore_patterns):
                    continue
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, base_dir)
                zf.write(file_path, rel_path)
                print(f"Adding {rel_path}...")

    print(f"\n[OK] Archivo ZIP para la nube creado con éxito: {zip_path}")

if __name__ == "__main__":
    create_cloud_zip()
