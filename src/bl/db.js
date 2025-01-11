class DB {
    storage = {}

    create(table, entity) {
        this.storage[table] = this.storage[table] || []
        this.storage[table].push(entity)
    }

    find(table, conditions = {}) {
        return (this.storage?.[table] || []).find(item => item.id === conditions.id)
    }
}

module.exports = new DB()