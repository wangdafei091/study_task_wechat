// components/task-info/task-info.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 任务数据
    task: {
      type: Object,
      value: {
        title: '',
        points: 0,
        description: ''
      }
    },
    // 任务类型
    taskType: {
      type: String,
      value: '',
      observer: function(newVal, oldVal) {
        // 添加属性变化的日志
        console.log('[task-info] taskType变化:', oldVal, '->', newVal);
      }
    },
    // 是否可编辑
    editable: {
      type: Boolean,
      value: true
    },
    // 是否使用模板模式
    isTemplateMode: {
      type: Boolean,
      value: false
    },
    // 是否显示保存为模板按钮(保留向后兼容)
    showSaveTemplate: {
      type: Boolean,
      value: false
    },
    // 是否应该显示保存按钮(简化逻辑)
    shouldShowSaveButton: {
      type: Boolean,
      value: false
    },
    // 是否来自模板编辑模式
    fromTemplate: {
      type: Boolean,
      value: false
    },
    // 是否显示描述字段
    showDescription: {
      type: Boolean,
      value: true
    },
    // 是否显示标题和类型
    showHeader: {
      type: Boolean,
      value: true
    },
    // 组件标题
    title: {
      type: String,
      value: ''
    },
    // 任务名称标签
    titleLabel: {
      type: String,
      value: '任务名称'
    },
    // 任务名称占位符
    titlePlaceholder: {
      type: String,
      value: '请输入任务名称'
    },
    // 任务名称最大长度
    titleMaxLength: {
      type: Number,
      value: 20
    },
    // 积分标签
    pointsLabel: {
      type: String,
      value: '积分'
    },
    // 积分占位符
    pointsPlaceholder: {
      type: String,
      value: '1-10'
    },
    // 描述标签
    descriptionLabel: {
      type: String,
      value: '任务描述'
    },
    // 描述占位符
    descriptionPlaceholder: {
      type: String,
      value: '简单描述任务内容和要求'
    },
    // 描述最大长度
    descriptionMaxLength: {
      type: Number,
      value: 100
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 本地数据可在这里定义
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 启用自定义模式
    enableCustomMode: function() {
      // 增强日志记录
      console.log('[task-info] 用户点击编辑按钮，触发启用编辑模式');
      
      // 触发事件通知页面，从模板进入编辑模式
      this.triggerEvent('enableCustomMode', {
        fromTemplate: true
      });
    },

    // 标题输入处理
    onTitleInput: function(e) {
      // 判断是否是从模板进入编辑模式
      // 当前不是模板模式(isTemplateMode为false)，但任务处于编辑状态且任务名称已有值时
      // 这很可能是从模板编辑模式切换过来的
      if (!this.properties.isTemplateMode && this.properties.task.isEditing && this.properties.task.title) {
        console.log('[task-info] 检测到从模板编辑模式，任务名称不可修改');
        // 保持原有标题不变
        this.setData({
          'task.title': this.properties.task.title
        });
        return;
      }
      
      const title = e.detail.value;
      
      // 更新本地task数据
      this.setData({
        'task.title': title
      });
      
      // 向父组件传递变更
      this.triggerEvent('change', {
        field: 'title',
        value: title,
        task: this.data.task
      });
    },

    // 积分输入处理
    onPointsInput: function(e) {
      let points = parseInt(e.detail.value);
      
      // 验证积分范围
      if (isNaN(points)) {
        points = 0;
      } else if (points > 10) {
        points = 10;
        // 记录日志
        console.log('[task-info] 积分已限制为最大值10');
      }
      
      // 更新本地task数据
      this.setData({
        'task.points': points
      });
      
      // 向父组件传递变更
      this.triggerEvent('change', {
        field: 'points',
        value: points,
        task: this.data.task
      });
    },

    // 描述输入处理
    onDescriptionInput: function(e) {
      const description = e.detail.value;
      
      // 更新本地task数据
      this.setData({
        'task.description': description
      });
      
      // 向父组件传递变更
      this.triggerEvent('change', {
        field: 'description',
        value: description,
        task: this.data.task
      });
    },

    // 保存为模板
    onSaveAsTemplate: function() {
      // 增强日志记录
      console.log('[task-info] 保存为常用任务按钮被点击');
      console.log('[task-info] 当前任务信息:', this.data.task);
      console.log('[task-info] 任务类型:', this.data.taskType);
      
      this.triggerEvent('savetemplate', {
        task: this.data.task
      });
    }
  }
}); 