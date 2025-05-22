/**
 * base-repository.js - 基础仓储类
 * 
 * 提供通用的CRUD操作和数据存取方法
 */

const logger = require('../utils/logger');
const StorageAdapter = require('../adapters/storage-adapter');

class BaseRepository {
  /**
   * 构造函数
   * @param {String} storageKey 存储键名
   * @param {Function} modelClass 模型构造函数
   * @param {Object} options 选项
   * @param {String} options.namespace 命名空间
   * @param {Boolean} options.useCache 是否使用缓存
   * @param {Number} options.cacheExpiry 缓存过期时间（毫秒）
   */
  constructor(storageKey, modelClass, options = {}) {
    // 检验参数
    if (!storageKey) {
      throw new Error('存储键名不能为空');
    }
    
    if (!modelClass || typeof modelClass !== 'function') {
      throw new Error('模型类不能为空且必须是构造函数');
    }
    
    // 初始化属性
    this.storageKey = storageKey;
    this.modelClass = modelClass;
    
    // 创建存储适配器
    this.storageAdapter = new StorageAdapter({
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000
    });
    
    // 内存缓存
    this._cache = null;
    this._cacheTime = 0;
    this._cacheTTL = options.cacheTTL || 10000; // 默认10秒内存缓存
    
    logger.info('BaseRepository', `创建${this.constructor.name}仓储, 存储键=${storageKey}`);
  }
  
  /**
   * 从存储中加载数据（兼容旧接口）
   * @returns {Promise<Boolean>} 是否加载成功
   */
  async loadFromStorage() {
    logger.info('BaseRepository', `从存储加载数据, 存储键=${this.storageKey}`);
    try {
      // 调用getAll强制从存储中加载数据
      await this.getAll(false);
      return true;
    } catch (error) {
      logger.error('BaseRepository', `从存储加载数据失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 获取所有实体
   * @param {Boolean} useCache 是否使用缓存
   * @returns {Promise<Array>} 实体列表
   */
  async getAll(useCache = true) {
    // 检查内存缓存
    if (useCache && this._isMemoryCacheValid()) {
      logger.info('BaseRepository', `从内存缓存获取数据, 存储键=${this.storageKey}`);
      return this._cloneModels(this._cache);
    }
    
    try {
      // 从存储中获取数据
      const data = await this.storageAdapter.getAsync(this.storageKey, []);
      
      // 转换为模型实例
      const models = this._createModels(data);
      
      // 更新缓存
      this._cache = models;
      this._cacheTime = Date.now();
      
      logger.info('BaseRepository', `获取所有数据成功, 存储键=${this.storageKey}, 条数=${models.length}`);
      
      return this._cloneModels(models);
    } catch (error) {
      logger.error('BaseRepository', `获取所有数据失败, 存储键=${this.storageKey}`, error);
      return [];
    }
  }
  
  /**
   * 根据ID获取实体
   * @param {String} id 实体ID
   * @returns {Promise<Object|null>} 实体对象或null
   */
  async getById(id) {
    if (!id) {
      logger.warn('BaseRepository', '尝试使用空ID获取实体');
      return null;
    }
    
    try {
      const all = await this.getAll();
      const entity = all.find(item => item.id === id);
      
      if (!entity) {
        logger.info('BaseRepository', `未找到ID为${id}的实体, 存储键=${this.storageKey}`);
        return null;
      }
      
      return this._cloneModel(entity);
    } catch (error) {
      logger.error('BaseRepository', `获取ID为${id}的实体失败, 存储键=${this.storageKey}`, error);
      return null;
    }
  }
  
  /**
   * 查询实体
   * @param {Function} predicate 过滤函数
   * @returns {Promise<Array>} 符合条件的实体列表
   */
  async query(predicate) {
    if (typeof predicate !== 'function') {
      logger.warn('BaseRepository', '尝试使用无效的查询谓词');
      return [];
    }
    
    try {
      const all = await this.getAll();
      const filtered = all.filter(predicate);
      
      logger.info('BaseRepository', `查询实体成功, 存储键=${this.storageKey}, 条数=${filtered.length}`);
      
      return this._cloneModels(filtered);
    } catch (error) {
      logger.error('BaseRepository', `查询实体失败, 存储键=${this.storageKey}`, error);
      return [];
    }
  }
  
  /**
   * 保存实体
   * @param {Object} entity 实体对象
   * @returns {Promise<Object|null>} 保存后的实体对象或null
   */
  async save(entity) {
    if (!entity) {
      logger.warn('BaseRepository', '尝试保存空实体');
      return null;
    }
    
    try {
      // 克隆防止引用变化
      const entityToSave = this._cloneModel(entity);
      
      // 获取所有实体
      const all = await this.getAll();
      
      // 查找实体索引
      const index = all.findIndex(item => item.id === entityToSave.id);
      
      // 更新或添加
      if (index >= 0) {
        all[index] = entityToSave;
        logger.info('BaseRepository', `更新实体成功, ID=${entityToSave.id}, 存储键=${this.storageKey}`);
      } else {
        all.push(entityToSave);
        logger.info('BaseRepository', `添加实体成功, ID=${entityToSave.id}, 存储键=${this.storageKey}`);
      }
      
      // 保存回存储
      await this._saveData(all);
      
      return this._cloneModel(entityToSave);
    } catch (error) {
      logger.error('BaseRepository', `保存实体失败, 存储键=${this.storageKey}`, error);
      return null;
    }
  }
  
  /**
   * 批量保存实体
   * @param {Array} entities 实体对象数组
   * @returns {Promise<Array>} 保存后的实体对象数组
   */
  async saveAll(entities) {
    if (!Array.isArray(entities) || entities.length === 0) {
      logger.warn('BaseRepository', '尝试批量保存空数组或无效数组');
      return [];
    }
    
    try {
      // 克隆防止引用变化
      const entitiesToSave = this._cloneModels(entities);
      
      // 获取所有实体
      const all = await this.getAll();
      
      // 创建ID到索引的映射
      const idMap = {};
      all.forEach((item, index) => {
        idMap[item.id] = index;
      });
      
      // 更新或添加每个实体
      entitiesToSave.forEach(entity => {
        const index = idMap[entity.id];
        
        if (index !== undefined) {
          // 更新已存在的实体
          all[index] = entity;
        } else {
          // 添加新实体
          all.push(entity);
        }
      });
      
      // 保存回存储
      await this._saveData(all);
      
      logger.info('BaseRepository', `批量保存实体成功, 数量=${entitiesToSave.length}, 存储键=${this.storageKey}`);
      
      return this._cloneModels(entitiesToSave);
    } catch (error) {
      logger.error('BaseRepository', `批量保存实体失败, 存储键=${this.storageKey}`, error);
      return [];
    }
  }
  
  /**
   * 删除实体
   * @param {String} id 实体ID
   * @returns {Promise<Boolean>} 是否删除成功
   */
  async delete(id) {
    if (!id) {
      logger.warn('BaseRepository', '尝试使用空ID删除实体');
      return false;
    }
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      
      // 找到实体索引
      const index = all.findIndex(item => item.id === id);
      
      // 如果实体不存在
      if (index === -1) {
        logger.info('BaseRepository', `要删除的实体不存在, ID=${id}, 存储键=${this.storageKey}`);
        return false;
      }
      
      // 删除实体
      all.splice(index, 1);
      
      // 保存回存储
      await this._saveData(all);
      
      logger.info('BaseRepository', `删除实体成功, ID=${id}, 存储键=${this.storageKey}`);
      
      return true;
    } catch (error) {
      logger.error('BaseRepository', `删除实体失败, ID=${id}, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 批量删除实体
   * @param {Function|Array} predicateOrIds 过滤函数或ID数组
   * @returns {Promise<Number>} 删除的实体数量
   */
  async deleteMany(predicateOrIds) {
    const isFunction = typeof predicateOrIds === 'function';
    const isArray = Array.isArray(predicateOrIds);
    
    if (!isFunction && !isArray) {
      logger.warn('BaseRepository', '尝试使用无效的条件批量删除实体');
      return 0;
    }
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      const originalCount = all.length;
      
      let filtered;
      
      if (isFunction) {
        // 使用过滤函数删除
        filtered = all.filter(item => !predicateOrIds(item));
      } else {
        // 使用ID数组删除
        const idSet = new Set(predicateOrIds);
        filtered = all.filter(item => !idSet.has(item.id));
      }
      
      // 计算删除数量
      const deletedCount = originalCount - filtered.length;
      
      if (deletedCount > 0) {
        // 保存回存储
        await this._saveData(filtered);
        
        logger.info('BaseRepository', `批量删除实体成功, 删除数量=${deletedCount}, 存储键=${this.storageKey}`);
      } else {
        logger.info('BaseRepository', `没有实体符合批量删除条件, 存储键=${this.storageKey}`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('BaseRepository', `批量删除实体失败, 存储键=${this.storageKey}`, error);
      return 0;
    }
  }
  
  /**
   * 清空存储
   * @returns {Promise<Boolean>} 是否清空成功
   */
  async clear() {
    try {
      // 清空存储
      await this._saveData([]);
      
      logger.info('BaseRepository', `清空存储成功, 存储键=${this.storageKey}`);
      
      return true;
    } catch (error) {
      logger.error('BaseRepository', `清空存储失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 计算实体数量
   * @param {Function} predicate 过滤函数，可选
   * @returns {Promise<Number>} 实体数量
   */
  async count(predicate) {
    try {
      const all = await this.getAll();
      
      if (typeof predicate === 'function') {
        // 使用过滤函数计算
        const filtered = all.filter(predicate);
        return filtered.length;
      }
      
      // 返回总数
      return all.length;
    } catch (error) {
      logger.error('BaseRepository', `计算实体数量失败, 存储键=${this.storageKey}`, error);
      return 0;
    }
  }
  
  /**
   * 检查存储是否存在
   * @returns {Promise<Boolean>} 是否存在
   */
  async exists() {
    try {
      const data = await this.storageAdapter.getAsync(this.storageKey);
      return data !== null && data !== undefined;
    } catch (error) {
      logger.error('BaseRepository', `检查存储是否存在失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 事务操作
   * @param {Function} transactionFn 事务函数，接收当前数据和修改函数
   * @returns {Promise<Boolean>} 是否成功
   */
  async transaction(transactionFn) {
    if (typeof transactionFn !== 'function') {
      logger.warn('BaseRepository', '尝试使用无效的事务函数');
      return false;
    }
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      
      // 克隆防止引用变化
      const dataToModify = this._cloneModels(all);
      
      // 执行事务函数
      await transactionFn(dataToModify);
      
      // 保存回存储
      await this._saveData(dataToModify);
      
      logger.info('BaseRepository', `事务操作成功, 存储键=${this.storageKey}`);
      
      return true;
    } catch (error) {
      logger.error('BaseRepository', `事务操作失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 保存数据到存储
   * @private
   * @param {Array} data 要保存的数据
   * @returns {Promise<Boolean>} 是否成功
   */
  async _saveData(data) {
    // 保存到存储
    const success = await this.storageAdapter.setAsync(this.storageKey, data);
    
    if (success) {
      // 更新内存缓存
      this._cache = this._createModels(data);
      this._cacheTime = Date.now();
    }
    
    return success;
  }
  
  /**
   * 检查内存缓存是否有效
   * @private
   * @returns {Boolean} 是否有效
   */
  _isMemoryCacheValid() {
    return this._cache !== null && 
           (Date.now() - this._cacheTime) < this._cacheTTL;
  }
  
  /**
   * 创建模型实例数组
   * @private
   * @param {Array} data 原始数据
   * @returns {Array} 模型实例数组
   */
  _createModels(data) {
    if (!Array.isArray(data)) return [];
    
    return data.map(item => {
      try {
        return new this.modelClass(item);
      } catch (error) {
        logger.error('BaseRepository', `创建模型实例失败`, error);
        return null;
      }
    }).filter(model => model !== null);
  }
  
  /**
   * 克隆模型实例数组
   * @private
   * @param {Array} models 模型实例数组
   * @returns {Array} 克隆后的模型实例数组
   */
  _cloneModels(models) {
    if (!Array.isArray(models)) return [];
    
    return models.map(model => this._cloneModel(model));
  }
  
  /**
   * 克隆单个模型实例
   * @private
   * @param {Object} model 模型实例
   * @returns {Object} 克隆后的模型实例
   */
  _cloneModel(model) {
    if (!model) return null;
    
    try {
      // 创建新实例
      return new this.modelClass({ ...model });
    } catch (error) {
      logger.error('BaseRepository', `克隆模型实例失败`, error);
      // 如果创建新实例失败，返回简单的对象副本
      return { ...model };
    }
  }
  
  /**
   * 使缓存失效，强制下次从存储加载
   */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
    logger.info('BaseRepository', `手动使缓存失效, 存储键=${this.storageKey}`);
  }
}

module.exports = BaseRepository; 