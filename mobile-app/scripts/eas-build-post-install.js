#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Running post-install script to fix ReactCommon redefinition...');

// Path to the problematic modulemap file
const moduleMapPath = path.join(
  __dirname,
  '../ios/Pods/Headers/Public/React-RuntimeApple/React-RuntimeApple.modulemap'
);

if (fs.existsSync(moduleMapPath)) {
  console.log('📝 Found React-RuntimeApple.modulemap, patching...');
  
  let content = fs.readFileSync(moduleMapPath, 'utf8');
  
  // Comment out the ReactCommon module definition to prevent duplicate
  content = content.replace(
    /module ReactCommon {[\s\S]*?}/g,
    '// ReactCommon module commented out to prevent redefinition error\n// $&'
  );
  
  fs.writeFileSync(moduleMapPath, content, 'utf8');
  console.log('✅ Successfully patched React-RuntimeApple.modulemap');
} else {
  console.log('⚠️  React-RuntimeApple.modulemap not found, skipping patch');
  console.log('   (This is normal if building for the first time)');
}

console.log('✅ Post-install script completed');
