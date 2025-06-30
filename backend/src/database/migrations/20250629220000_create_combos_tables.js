    /**
     * @param { import("knex").Knex } knex
     * @returns { Promise<void> }
     */
    exports.up = function(knex) {
      // 1. Primeiro, cria a tabela principal 'combos'
      return knex.schema.createTable('combos', (table) => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.text('description').nullable();
        table.decimal('price', 10, 2).notNullable();
        table.string('image_url').nullable();
        table.boolean('status').defaultTo(true).notNullable();
        table.timestamps(true, true);
      })
      // 2. Depois, cria a tabela de ligação 'combo_products'
      .then(() => {
        return knex.schema.createTable('combo_products', (table) => {
          table.increments('id').primary();
          
          // Chave estrangeira para o combo
          table.integer('combo_id').unsigned().notNullable()
            .references('id').inTable('combos').onDelete('CASCADE');
          
          // Chave estrangeira para o produto
          table.integer('product_id').unsigned().notNullable()
            .references('id').inTable('products').onDelete('CASCADE');
          
          // Quantidade daquele produto específico dentro do combo (ex: 2 refrigerantes)
          table.integer('quantity_in_combo').defaultTo(1).notNullable();

          // Garante que a mesma combinação de combo e produto não se repita
          table.unique(['combo_id', 'product_id']);
        });
      });
    };

    /**
     * @param { import("knex").Knex } knex
     * @returns { Promise<void> }
     */
    exports.down = function(knex) {
      // Desfaz na ordem inversa: primeiro a tabela de ligação, depois a principal
      return knex.schema.dropTable('combo_products')
        .then(() => {
          return knex.schema.dropTable('combos');
        });
    };
    