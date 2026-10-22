
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401


def main():
    url = make_url(settings.database_url)

    # Use the synchronous PostgreSQL driver for schema inspection.
    if url.drivername in ("postgresql", "postgresql+asyncpg"):
        url = url.set(drivername="postgresql+psycopg")

    engine = create_engine(url)

    try:
        inspector = inspect(engine)

        database_tables = set(
            inspector.get_table_names(schema="public")
        )
        model_tables = set(Base.metadata.tables.keys())

        print("DATABASE:", url.database)
        print("\nTABLE COMPARISON")
        print("Tables in database:", sorted(database_tables))
        print("Tables in models:", sorted(model_tables))

        missing_tables = model_tables - database_tables
        extra_tables = database_tables - model_tables - {
            "spatial_ref_sys"
        }

        if missing_tables:
            print("\nMISSING TABLES:", sorted(missing_tables))

        if extra_tables:
            print("\nEXTRA DATABASE TABLES:", sorted(extra_tables))

        for table_name in sorted(model_tables):
            print(f"\n--- {table_name} ---")

            if table_name not in database_tables:
                print("MISSING FROM DATABASE")
                continue

            model_table = Base.metadata.tables[table_name]

            # Compare database and model columns.
            db_columns = {
                column["name"]: column
                for column in inspector.get_columns(
                    table_name, schema="public"
                )
            }
            model_columns = {
                column.name: column
                for column in model_table.columns
            }

            for name in sorted(set(db_columns) | set(model_columns)):
                if name not in db_columns:
                    print(f"MISSING DATABASE COLUMN: {name}")
                    continue

                if name not in model_columns:
                    print(f"EXTRA DATABASE COLUMN: {name}")
                    continue

                db_column = db_columns[name]
                model_column = model_columns[name]

                print(
                    f"{name}: "
                    f"database={db_column['type']}; "
                    f"model={model_column.type}"
                )

                if db_column.get("nullable") != model_column.nullable:
                    print(
                        f"  NULLABILITY DIFFERENCE: "
                        f"database nullable={db_column.get('nullable')}, "
                        f"model nullable={model_column.nullable}"
                    )

            # Compare primary keys.
            db_pk = inspector.get_pk_constraint(
                table_name, schema="public"
            ).get("constrained_columns") or []

            model_pk = [
                column.name
                for column in model_table.primary_key.columns
            ]

            if set(db_pk) != set(model_pk):
                print("PRIMARY KEY DIFFERENCE:")
                print("  Database:", db_pk)
                print("  Models:", model_pk)

            # Compare foreign keys.
            db_fks = {
                (
                    tuple(fk["constrained_columns"] or []),
                    fk["referred_table"],
                    tuple(fk["referred_columns"] or []),
                )
                for fk in inspector.get_foreign_keys(
                    table_name, schema="public"
                )
            }

            model_fks = set()

            for constraint in model_table.foreign_key_constraints:
                elements = list(constraint.elements)

                if not elements:
                    continue

                model_fks.add(
                    (
                        tuple(
                            element.parent.name
                            for element in elements
                        ),
                        elements[0].column.table.name,
                        tuple(
                            element.column.name
                            for element in elements
                        ),
                    )
                )

            if db_fks != model_fks:
                print("FOREIGN KEY DIFFERENCE:")
                print("  Database:", db_fks)
                print("  Models:", model_fks)

            # Compare indexes by indexed column names.
            db_indexes = {
                tuple(index["column_names"] or [])
                for index in inspector.get_indexes(
                    table_name, schema="public"
                )
                if index.get("column_names")
            }

            model_indexes = {
                tuple(column.name for column in index.columns)
                for index in model_table.indexes
            }

            if db_indexes != model_indexes:
                print("INDEX COLUMN DIFFERENCES:")
                print("  Database:", db_indexes)
                print("  Models:", model_indexes)

        print("\nInspection completed.")
        print("No database changes were made.")

    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
