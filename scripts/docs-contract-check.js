#!/usr/bin/env node

/**
 * API 契约一致性检查脚本
 * 检查服务/仓储 API 文档与实际代码实现的一致性
 * 改进：增加双向检查
 */

const fs = require('fs');
const path = require('path');

const CHECK_PASSED = 0;
const CHECK_FAILED = 1;


// 提取代码中的公共方法签名
function extractPublicMethodsFromCode(codeContent) {
  const methods = [];

  // 排除的JavaScript保留字和控制语句
  const excludedKeywords = new Set([
    'super', 'constructor', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw',
    'new', 'this', 'class', 'extends', 'import', 'export', 'default', 'from',
    'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'with', 'yield',
    'await', 'async', 'function', 'var', 'let', 'const', 'static'
  ]);

  // 匹配类方法定义：async methodName 或 methodName 格式
  // 排除 Promise 回调和函数表达式
  const methodRegex = /^(?!\s*\)\s*=>|return\s+new\s+Promise\(|resolve\s*\()/gm;
  let match;
  let lines = codeContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 只匹配行首的方法定义，忽略函数内部的调用
    const lineMatch = line.match(/^\s*(?:async\s+)?([a-zA-Z0-9_]+)(?!\s*=\s*function|\s*\)\s*=>|\s*return\s+new\s+Promise\()\s*\(/);
    if (lineMatch) {
      const methodName = lineMatch[1];

      // 排除私有方法、保留字、以及 resolve/reject
      if (!methodName.startsWith('_') &&
          !excludedKeywords.has(methodName) &&
          methodName !== 'resolve' &&
          methodName !== 'reject') {

        // 检查前面是否有至少2个空格（类方法缩进）
        if (line.length - line.trimLeft().length >= 2) {
          // 确保前面没有 Promise(...) 的模式
          const prevLine = i > 0 ? lines[i-1] : '';
          if (!prevLine.includes('Promise') ||
              !line.includes('resolve') && !line.includes('reject')) {
            methods.push(methodName);
          }
        }
      }
    }
  }

  return methods;
}

// 提取文档中的方法签名（支持参数级检查）
function extractMethodSignaturesFromDocs(docContent, serviceName) {
  const signatures = [];
  const methodDetails = [];

  // 仓储使用 #### method(...) 格式
  // 服务使用 ##### \`method(...)\` 格式
  const serviceSectionRegex = new RegExp(`## ${serviceName.replace(/\./g, '\\\\')} - [^\\n]+`, 'i');
  const serviceSectionMatch = docContent.match(serviceSectionRegex);

  if (!serviceSectionMatch) {
    console.warn(`未找到 ${serviceName} 章节，跳过检查`);
    return { signatures, methodDetails };
  }

  // 提取该章节的起始位置
  const serviceSectionStart = docContent.indexOf(serviceSectionMatch[0]);
  const nextSectionIndex = docContent.indexOf('\n## ', serviceSectionStart + 1);
  const serviceSectionEnd = nextSectionIndex !== -1 ? nextSectionIndex : docContent.length;
  const serviceSectionContent = docContent.substring(serviceSectionStart, serviceSectionEnd);

  // 提取完整的方法签名
  const methodRegex = /(#####\s*`?([a-zA-Z0-9_]+)\s*\([^)]*\)`?)/g;
  let match;

  while ((match = methodRegex.exec(serviceSectionContent)) !== null) {
    const fullSignature = match[0];
    const methodName = match[2];

    if (!methodName.startsWith('_')) {
      signatures.push(methodName);
      methodDetails.push({
        name: methodName,
        signature: fullSignature,
        parameters: extractParameters(fullSignature)
      });
    }
  }

  return { signatures, methodDetails };
}

// 提取参数信息
function extractParameters(signature) {
  const paramMatch = signature.match(/\(([^)]*)\)/);
  if (!paramMatch) return [];
  return paramMatch[1].split(',').map(p => p.trim()).filter(p => p);
}

// 提取代码中的方法签名（包含参数）
function extractFullMethodSignaturesFromCode(codeContent) {
  const methods = [];
  const methodDetails = [];

  const excludedKeywords = new Set([
    'super', 'constructor', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw',
    'new', 'this', 'class', 'extends', 'import', 'export', 'default', 'from',
    'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'with', 'yield',
    'await', 'async', 'function', 'var', 'let', 'const', 'static'
  ]);

  const methodRegex = /^(?!\s*\)\s*=>|return\s+new\s+Promise\(|resolve\s*\()/gm;
  let lines = codeContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const lineMatch = line.match(/^\s*(?:async\s+)?([a-zA-Z0-9_]+)(?!\s*=\s*function|\s*\)\s*=>|\s*return\s+new\s+Promise\()\s*\(/);
    if (lineMatch) {
      const methodName = lineMatch[1];

      if (!methodName.startsWith('_') && !excludedKeywords.has(methodName) && methodName !== 'resolve' && methodName !== 'reject') {
        const leadingSpaces = line.length - line.trimLeft().length;
        if (leadingSpaces >= 2) {
          const prevLine = i > 0 ? lines[i-1] : '';
          if (!prevLine.includes('Promise') ||
              !line.includes('resolve') && !line.includes('reject')) {

            // 提取完整参数
            const paramMatch = line.match(/\(([^)]*)\)/);
            const params = paramMatch ? paramMatch[1].split(',').map(p => p.trim()).filter(p => p) : [];

            methods.push(methodName);
            methodDetails.push({
              name: methodName,
              signature: `${methodName}(${paramMatch ? paramMatch[1] : ''})`,
              parameters: params
            });
          }
        }
      }
    }
  }

  return { methods, methodDetails };
}

function checkServiceContract(serviceName, docsPath, codePath) {
  console.log(`\n🔍 检查 ${serviceName}...`);

  let docsContent, codeContent;

  try {
    docsContent = fs.readFileSync(docsPath, 'utf8');
  } catch (error) {
    console.error(`❌ 无法读取文档: ${docsPath}`);
    return { passed: false };
  }

  try {
    codeContent = fs.readFileSync(codePath, 'utf8');
  } catch (error) {
    console.error(`❌ 无法读取代码: ${codePath}`);
    return { passed: false };
  }

  const { signatures: docMethods, methodDetails: docMethodDetails } = extractMethodSignaturesFromDocs(docsContent, serviceName);
  const { methods: codeMethods, methodDetails: codeMethodDetails } = extractFullMethodSignaturesFromCode(codeContent);

  if (docMethods.length === 0) {
    console.log(`⚠️  ${serviceName} 文档中没有方法定义，跳过检查`);
    return { passed: true }; // 跳过不算失败
  }

  console.log(`   文档方法: ${docMethods.length}个`);
  console.log(`   代码方法: ${codeMethods.length}个`);

  // 检查1：文档里的方法是否在代码里存在
  const missingInCode = docMethods.filter(m => !codeMethods.includes(m));
  if (missingInCode.length > 0) {
    console.error(`❌ 以下方法在文档中记录但在代码中不存在:`);
    missingInCode.forEach(m => {
      console.error(`   - ${m}()`);
    });
    return { passed: false };
  }

  // 检查参数级一致性（新增）
  console.log(`\n🔍 参数级一致性检查:`);
  const paramIssues = [];

  docMethodDetails.forEach(docMethod => {
    const codeMethod = codeMethodDetails.find(cm => cm.name === docMethod.name);
    if (codeMethod) {
      // 比较参数数量
      if (docMethod.parameters.length !== codeMethod.parameters.length) {
        paramIssues.push({
          method: docMethod.name,
          issue: `参数数量不匹配 - 文档: ${docMethod.parameters.length}, 代码: ${codeMethod.parameters.length}`
        });
      } else {
        // 比较参数名（假设顺序相同）
        docMethod.parameters.forEach((param, index) => {
          if (param !== codeMethod.parameters[index]) {
            paramIssues.push({
              method: docMethod.name,
              issue: `第${index+1}个参数不匹配 - 文档: "${param}", 代码: "${codeMethod.parameters[index]}"`
            });
          }
        });
      }
    }
  });

  if (paramIssues.length > 0) {
    console.error(`❌ 参数一致性检查失败:`);
    paramIssues.forEach(issue => {
      console.error(`   - ${issue.method}(): ${issue.issue}`);
    });
    return { passed: false };
  } else {
    console.log(`✅ 所有方法参数一致`);
  }

  // 检查2：代码里的方法是否被文档覆盖（反向检查）
  const notCovered = codeMethods.filter(m => !docMethods.includes(m));
  if (notCovered.length > 0) {
    console.warn(`⚠️  以下代码方法未被文档覆盖（建议补充到文档）:`);
    notCovered.slice(0, 10).forEach(m => {
      console.warn(`   - ${m}()`);
    });
    // 对于服务层，未覆盖的方法过多时算作警告但不算失败
    // 因为存在很多内部辅助方法不需要在API文档中体现
    if (notCovered.length > codeMethods.length * 0.5) {
      console.warn(`   ⚠️  超过50%的方法未覆盖，可能文档不完整`);
    }
  }

  console.log(`✅ ${serviceName} API 文档与代码一致`);
  return { passed: true };
}

function checkRepositoryContract(repoName, docsPath, codePath) {
  console.log(`\n🔍 检查 ${repoName}...`);

  let docsContent, codeContent;

  try {
    docsContent = fs.readFileSync(docsPath, 'utf8');
  } catch (error) {
    console.error(`❌ 无法读取文档: ${docsPath}`);
    return { passed: false };
  }

  try {
    codeContent = fs.readFileSync(codePath, 'utf8');
  } catch (error) {
    console.error(`❌ 无法读取代码: ${codePath}`);
    return { passed: false };
  }

  const { signatures: docMethods, methodDetails: docMethodDetails } = extractMethodSignaturesFromDocs(docsContent, repoName);
  const { methods: codeMethods, methodDetails: codeMethodDetails } = extractFullMethodSignaturesFromCode(codeContent);

  if (docMethods.length === 0) {
    console.log(`⚠️  ${repoName} 文档中没有方法定义，跳过检查`);
    return { passed: true }; // 跳过不算失败
  }

  console.log(`   文档方法: ${docMethods.length}个`);
  console.log(`   代码方法: ${codeMethods.length}个`);

  // 检查1：文档里的方法是否在代码里存在
  const missingInCode = docMethods.filter(m => !codeMethods.includes(m));
  if (missingInCode.length > 0) {
    console.error(`❌ 以下方法在文档中记录但在代码中不存在:`);
    missingInCode.forEach(m => {
      console.error(`   - ${m}()`);
    });
    return { passed: false };
  }

  // 检查参数级一致性（新增）
  console.log(`\n🔍 参数级一致性检查:`);
  const paramIssues = [];

  docMethodDetails.forEach(docMethod => {
    const codeMethod = codeMethodDetails.find(cm => cm.name === docMethod.name);
    if (codeMethod) {
      // 比较参数数量
      if (docMethod.parameters.length !== codeMethod.parameters.length) {
        paramIssues.push({
          method: docMethod.name,
          issue: `参数数量不匹配 - 文档: ${docMethod.parameters.length}, 代码: ${codeMethod.parameters.length}`
        });
      } else {
        // 比较参数名（假设顺序相同）
        docMethod.parameters.forEach((param, index) => {
          if (param !== codeMethod.parameters[index]) {
            paramIssues.push({
              method: docMethod.name,
              issue: `第${index+1}个参数不匹配 - 文档: "${param}", 代码: "${codeMethod.parameters[index]}"`
            });
          }
        });
      }
    }
  });

  if (paramIssues.length > 0) {
    console.error(`❌ 参数一致性检查失败:`);
    paramIssues.forEach(issue => {
      console.error(`   - ${issue.method}(): ${issue.issue}`);
    });
    return { passed: false };
  } else {
    console.log(`✅ 所有方法参数一致`);
  }

  // 检查2：代码里的方法是否被文档覆盖（反向检查）
  const notCovered = codeMethods.filter(m => !docMethods.includes(m));
  if (notCovered.length > 0) {
    console.warn(`⚠️ 以下代码方法未被文档覆盖（建议补充到文档）:`);
    notCovered.slice(0, 10).forEach(m => {
      console.warn(`   - ${m}()`);
    });
    // 对于仓储层，如果文档中只有少量方法（如2-3个），但实际有很多方法
    // 这说明文档不完整，应该提高质量门
    if (docMethods.length <= 3 && notCovered.length > codeMethods.length * 0.8) {
      console.warn(`   ⚠️  仓储文档方法过少，覆盖率低，建议补充更多API文档`);
    }
  }

  console.log(`✅ ${repoName} API 文档与代码一致`);
  return { passed: true };
}

function runCheck() {
  console.log('\n🔍 开始 API 契约一致性检查...\n');

  const results = [];

  // 检查服务
  results.push(checkServiceContract(
    'TaskService',
    path.join(__dirname, '../docs/api/services-guide.md'),
    path.join(__dirname, '../services/task-service.js')
  ));

  results.push(checkServiceContract(
    'MessageService',
    path.join(__dirname, '../docs/api/services-guide.md'),
    path.join(__dirname, '../services/message-service.js')
  ));

  results.push(checkServiceContract(
    'RewardService',
    path.join(__dirname, '../docs/api/services-guide.md'),
    path.join(__dirname, '../services/reward-service.js')
  ));

  results.push(checkServiceContract(
    'UserService',
    path.join(__dirname, '../docs/api/services-guide.md'),
    path.join(__dirname, '../services/user-service.js')
  ));

  results.push(checkServiceContract(
    'ConfigService',
    path.join(__dirname, '../docs/api/services-guide.md'),
    path.join(__dirname, '../services/config-service.js')
  ));

  // 检查仓储
  results.push(checkRepositoryContract(
    'RewardRepository',
    path.join(__dirname, '../docs/api/repositories.md'),
    path.join(__dirname, '../repositories/reward-repository.js')
  ));

  results.push(checkRepositoryContract(
    'MessageRepository',
    path.join(__dirname, '../docs/api/repositories.md'),
    path.join(__dirname, '../repositories/message-repository.js')
  ));

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`契约检查完成: ${passed}/${total} 通过`);
  console.log('='.repeat(50));

  if (passed === total) {
    console.log('\n✅ 所有 API 契约检查通过\n');
    return CHECK_PASSED;
  } else {
    console.log(`\n❌ ${total - passed} 个服务检查失败\n`);
    return CHECK_FAILED;
  }
}

// 运行检查
const exitCode = runCheck();
process.exit(exitCode);
