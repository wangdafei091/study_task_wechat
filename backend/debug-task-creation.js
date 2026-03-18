/**
 * 调试任务创建问题
 */

require('dotenv').config();
const Task = require('./models/Task');
const taskService = require('./services/taskService');
const { generateToken } = require('./config/jwt');

async function debugTaskCreation() {
  try {
    console.log('🔍 开始调试任务创建问题...\n');

    // 1. 生成Token
    console.log('🔑 1. 生成Token');
    const testUser = {
      userId: 'test_user_debug',
      openid: 'test_openid_debug',
      role: 'user'
    };
    const token = generateToken(testUser);
    console.log('✅ Token生成成功\n');

    // 2. 测试任务数据验证
    console.log('📝 2. 测试任务数据验证');
    const taskData = {
      title: '调试测试任务',
      description: '这是一个调试测试任务',
      type: 'study',
      date: '2026-03-08',
      startTime: '19:00',
      endTime: '20:00',
      points: 10,
      pointsExpiry: 'permanent',
      isRequired: true,
      isAllDay: false
    };

    const validation = Task.validate(taskData, false);
    console.log('✅ 验证结果：', validation.valid);
    if (!validation.valid) {
      console.log('❌ 验证错误：', validation.errors);
      return;
    }
    console.log('');

    // 3. 测试Task模型转换
    console.log('📋 3. 测试Task模型转换');
    const task = new Task(taskData);
    console.log('✅ Task实例创建成功');
    console.log('📊 Task.toDB():', task.toDB());
    console.log('');

    // 4. 测试数据库连接
    console.log('🗄️ 4. 测试数据库连接');
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    console.log('✅ 数据库连接成功');
    console.log('');

    // 5. 测试简单的SQL插入
    console.log('📝 5. 测试简单的SQL插入');
    const taskId = Task.generateId();
    const dbRecord = task.toDB();
    dbRecord.task_id = taskId;
    dbRecord.user_id = testUser.userId;

    console.log('📊 准备插入的数据：', {
      task_id: dbRecord.task_id,
      user_id: dbRecord.user_id,
      title: dbRecord.title,
      type: dbRecord.type,
      date: dbRecord.date,
      points: dbRecord.points,
      pointsExpiry: dbRecord.pointsExpiry
    });

    const sql = `INSERT INTO tasks (task_id, user_id, title, description, type, date, startTime, endTime, points, pointsExpiry, isRequired, status, repeat, isAllDay, penaltyApplied) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      dbRecord.task_id,
      dbRecord.user_id,
      dbRecord.title,
      dbRecord.description,
      dbRecord.type,
      dbRecord.date,
      dbRecord.startTime,
      dbRecord.endTime,
      dbRecord.points,
      dbRecord.pointsExpiry,
      dbRecord.isRequired,
      dbRecord.status,
      dbRecord.repeat,
      dbRecord.isAllDay,
      dbRecord.penaltyApplied
    ];

    console.log('🔢 SQL参数：', values);

    const result = await connection.execute(sql, values);
    console.log('✅ SQL插入成功！影响行数：', result[0].affectedRows);
    console.log('');

    // 6. 查询插入的数据
    console.log('🔍 6. 查询插入的数据');
    const [rows] = await connection.execute('SELECT * FROM tasks WHERE task_id = ?', [taskId]);
    console.log('✅ 查询到数据：', rows.length > 0 ? rows[0].title : '未找到');
    console.log('');

    // 7. 测试service层创建
    console.log('🏢 7. 测试service层创建');
    try {
      const createdTask = await taskService.createTask(testUser.userId, taskData);
      console.log('✅ Service层创建成功：', createdTask.title);
    } catch (error) {
      console.error('❌ Service层创建失败：', error.message);
      console.error('详细错误：', error);
    }

    await connection.end();
    console.log('\n✅ 调试完成！');

  } catch (error) {
    console.error('❌ 调试过程出错：', error.message);
    console.error('详细错误堆栈：', error.stack);
  }
}

debugTaskCreation();