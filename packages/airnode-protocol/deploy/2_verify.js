const hre = require('hardhat');

module.exports = async ({ deployments }) => {
  const AccessControlRegistry = await deployments.get('AccessControlRegistry');
  await hre.run('verify:verify', {
    address: AccessControlRegistry.address,
    constructorArguments: [],
  });

  const RequesterAuthorizerWithAirnode = await deployments.get('RequesterAuthorizerWithAirnodeV0');
  await hre.run('verify:verify', {
    address: RequesterAuthorizerWithAirnode.address,
    constructorArguments: [AccessControlRegistry.address, 'RequesterAuthorizerWithAirnodeV0 admin'],
  });

  const AirnodeRrp = await deployments.get('AirnodeRrp');
  await hre.run('verify:verify', {
    address: AirnodeRrp.address,
    constructorArguments: [],
  });
};
module.exports.tags = ['verify'];
module.exports.dependencies = ['deploy'];
