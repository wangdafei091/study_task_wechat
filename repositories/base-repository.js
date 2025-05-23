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
    
    logger.debug('BaseRepository', `创建${this.constructor.name}仓储, 存储键=${storageKey}`);
  }
  
  /**
   * 从存储中加载数据（兼容旧接口）
   * @returns {Promise<Boolean>} 是否加载成功
   */
  async loadFromStorage() {
    logger.debug('BaseRepository', `从存储加载数据, 存储键=${this.storageKey}`);
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
      logger.debug('BaseRepository', `从内存缓存获取数据, 存储键=${this.storageKey}`);
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
      
      logger.debug('BaseRepository', `获取所有数据成功, 存储键=${this.storageKey}, 条数=${models.length}`);
      
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
    logger.debug('BaseRepository', `根据ID获取实体, ID=${id}`);
    
    if (!id) {
      logger.warn('BaseRepository', '尝试使用空ID获取实体');
      return null;
    }
    
    try {
      const all = await this.getAll();
      const entity = all.find(item => item.id === id);
      
      if (!entity) {
        logger.debug('BaseRepository', `未找到ID为${id}的实体, 存储键=${this.storageKey}`);
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
      
      // 保留独特信息
      logger.debug('BaseRepository', `查询实体成功, 存储键=${this.storageKey}, 条数=${filtered.length}`);
      
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
    
    logger.debug('BaseRepository', `开始保存实体, ID=${entity.id || '新实体'}`);
    
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
      
      logger.debug('BaseRepository', `保存实体完成, ID=${entityToSave.id}, 类型=${entityToSave.constructor.name || '未知'}`);
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
    
    logger.debug('BaseRepository', `开始批量保存实体, 数量=${entities.length}`);
    
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
    
    logger.debug('BaseRepository', `开始删除实体, ID=${id}`);
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      
      // 查找实体索引
      const index = all.findIndex(item => item.id === id);
      
      if (index < 0) {
        logger.debug('BaseRepository', `未找到要删除的实体, ID=${id}, 存储键=${this.storageKey}`);
        return false;
      }
      
      // 删除实体
      all.splice(index, 1);
      
      // 保存回存储
      await this._saveData(all);
      
      // 清除实体缓存
      this.invalidateCache();
      
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
    if (!predicateOrIds) {
      logger.warn('BaseRepository', '尝试使用无效参数批量删除实体');
      return 0;
    }
    
    logger.debug('BaseRepository', `开始批量删除实体, 参数类型=${typeof predicateOrIds}`);
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      const originalLength = all.length;
      
      let filteredIds = [];
      
      // 根据参数类型确定过滤方式
      if (typeof predicateOrIds === 'function') {
        // 使用谓词过滤
        const filtered = all.filter(predicateOrIds);
        filteredIds = filtered.map(item => item.id);
      } else if (Array.isArray(predicateOrIds)) {
        // 直接使用ID数组
        filteredIds = predicateOrIds;
      } else {
        logger.warn('BaseRepository', `无效的批量删除参数类型: ${typeof predicateOrIds}`);
        return 0;
      }
      
      if (filteredIds.length === 0) {
        logger.debug('BaseRepository', '没有找到要删除的实体');
        return 0;
      }
      
      // 创建ID集合以提高查找效率
      const idSet = new Set(filteredIds);
      
      // 过滤不需要删除的实体
      const newEntities = all.filter(item => !idSet.has(item.id));
      
      // 计算删除数量
      const deletedCount = originalLength - newEntities.length;
      
      if (deletedCount === 0) {
        logger.debug('BaseRepository', '没有删除任何实体');
        return 0;
      }
      
      // 保存回存储
      await this._saveData(newEntities);
      
      // 清除实体缓存
      this.invalidateCache();
      
      logger.info('BaseRepository', `批量删除实体成功, 删除数量=${deletedCount}, 存储键=${this.storageKey}`);
      
      return deletedCount;
    } catch (error) {
      logger.error('BaseRepository', `批量删除实体失败, 存储键=${this.storageKey}`, error);
      return 0;
    }
  }
  
  /**
   * 清空所有实体
   * @returns {Promise<Boolean>} 是否清空成功
   */
  async clear() {
    logger.info('BaseRepository', `开始清空所有实体, 存储键=${this.storageKey}`);
    
    try {
      // 保存空数组
      await this._saveData([]);
      
      // 清除实体缓存
      this.invalidateCache();
      
      logger.info('BaseRepository', `清空所有实体成功, 存储键=${this.storageKey}`);
      
      return true;
    } catch (error) {
      logger.error('BaseRepository', `清空所有实体失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 计算匹配实体的数量
   * @param {Function} predicate 可选的过滤函数
   * @returns {Promise<Number>} 实体数量
   */
  async count(predicate) {
    try {
      // 获取所有实体
      const all = await this.getAll();
      
      // 如果提供了过滤函数，则过滤
      if (typeof predicate === 'function') {
        const filtered = all.filter(predicate);
        return filtered.length;
      }
      
      // 否则返回所有实体数量
      return all.length;
    } catch (error) {
      logger.error('BaseRepository', `计算实体数量失败, 存储键=${this.storageKey}`, error);
      return 0;
    }
  }
  
  /**
   * 检查仓储是否存在
   * @returns {Promise<Boolean>} 仓储是否存在
   */
  async exists() {
    try {
      return await this.storageAdapter.exists(this.storageKey);
    } catch (error) {
      logger.error('BaseRepository', `检查仓储是否存在失败, 存储键=${this.storageKey}`, error);
      return false;
    }
  }
  
  /**
   * 执行事务操作
   * @param {Function} transactionFn 事务函数
   * @returns {Promise<*>} 事务结果
   */
  async transaction(transactionFn) {
    if (typeof transactionFn !== 'function') {
      logger.warn('BaseRepository', '尝试使用无效的事务函数');
      return null;
    }
    
    logger.debug('BaseRepository', `开始执行事务, 存储键=${this.storageKey}`);
    
    try {
      // 获取所有实体
      const all = await this.getAll();
      
      // 克隆防止引用变化
      const entities = this._cloneModels(all);
      
      // 执行事务函数
      const result = await transactionFn(entities);
      
      // 保存回存储
      await this._saveData(entities);
      
      // 清除实体缓存
      this.invalidateCache();
      
      logger.debug('BaseRepository', `事务执行成功, 存储键=${this.storageKey}`);
      
      return result;
    } catch (error) {
      logger.error('BaseRepository', `事务执行失败, 存储键=${this.storageKey}`, error);
      throw error;
    }
  }
  
  /**
   * 保存数据到存储
   * @private
   * @param {Array} data 要保存的数据
   * @returns {Promise<Boolean>} 是否保存成功
   */
  async _saveData(data) {
    try {
      await this.storageAdapter.setAsync(this.storageKey, data);
      
      // 更新缓存
      this._cache = this._createModels(data);
      this._cacheTime = Date.now();
      
      return true;
    } catch (error) {
      logger.error('BaseRepository', `保存数据到存储失败, 存储键=${this.storageKey}`, error);
      return false;
    }
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
   * 创建模型实例
   * @private
   * @param {Array} data 原始数据
   * @returns {Array} 模型实例数组
   */
  _createModels(data) {
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data.map(item => {
      return new this.modelClass(item);
    });
  }
  
  /**
   * 克隆模型数组
   * @private
   * @param {Array} models 模型数组
   * @returns {Array} 克隆后的模型数组
   */
  _cloneModels(models) {
    if (!Array.isArray(models)) {
      return [];
    }
    
    return models.map(model => this._cloneModel(model));
  }
  
  /**
   * 克隆单个模型
   * @private
   * @param {Object} model 模型实例
   * @returns {Object} 克隆后的模型实例
   */
  _cloneModel(model) {
    if (!model) {
      return null;
    }
    
    // 如果模型有克隆方法，则调用
    if (typeof model.clone === 'function') {
      return model.clone();
    }
    
    // 否则创建新实例
    return new this.modelClass(model);
  }
  
  /**
   * 清除缓存
   */
  invalidateCache() {
    this._cache = null;
    this._cacheTime = 0;
    
    // 清除存储适配器的缓存
    if (typeof this.storageAdapter.clearCache === 'function') {
      this.storageAdapter.clearCache(this.storageKey);
    }
  }
}

module.exports = BaseRepository; 