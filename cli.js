#! /usr/bin/env node

const fs = require('fs');
const cf = require('@mapbox/cfn-config');
const AWS = require('aws-sdk');
const friend = require('@mapbox/cloudfriend');
const path = require('path');
const prompt = require('prompt');
const argv = require('minimist')(process.argv, {
    boolean: ['help']
});

if (!argv._[2] || argv.help) {
    console.log();
    console.log('usage: oa <command> [--version] [--help]');
    console.log()
    console.log('Create, manage and delete OpenAddresses Cloud Resouces from the CLI');
    console.log();
    console.log('<command>:');
    console.log('    init      [--help]         Setup Credentials for using OA CLI');
    console.log('    list      [--help]         List all stack assoc. with the current repo');
    console.log('    create    [--help]         Create a new stack of the current repo');
    console.log('    update    [--help]         Update an existing stack of the current repo');
    console.log('    delete    [--help]         Delete an existing stack of the current repo');
    console.log();
    console.log('[options]:');
    console.log('    --version, -v           Displays version information');
    console.log('    --help                  Prints this help message');
    console.log();
    process.exit();
}

const command = argv._[2];

if (command === 'create' && argv.help) {
    console.log();
    console.log('usage oa create <STACK>');
    console.log();
    console.log('Create new AWS resource from a CF Template');
    console.log('template should be in the following location:');
    console.log('  cloudformation/<reponame>.template.json');
    console.log('  cloudformation/<reponame>.template.js');
    console.log();
    process.exit();
} else if (command === 'update' && argv.help) {
    console.log();
    console.log('usage oa update <STACK>');
    console.log()
    process.exit();
} else if (command === 'delete' && argv.help) {
    console.log();
    console.log('usage oa delete <STACK>');
    console.log()
    process.exit();
} else if (command === 'list' && argv.help) {
    console.log();
    console.log('usage oa list');
    console.log();
    console.error('List all of the currently running stacks deployed from the current repo');
    console.log()
}

if (command === 'init') {
    prompt.message = '$';
    prompt.start();

    prompt.get([{
        name: 'AWS_DEFAULT_REGION',
        type: 'string',
        required: true,
        default: 'us-east-1'
    },{
        name: 'AWS_ACCOUNT_ID',
        type: 'string',
        required: true
    },{
        name: 'AWS_ACCESS_KEY_ID',
        type: 'string',
        required: true
    },{
        name: 'AWS_SECRET_ACCESS_KEY',
        hidden: true,
        replace: '*',
        required: true,
        type: 'string'
    }], (err, argv) => {
        if (err) return console.error(`oa init failed: ${err.message}`);

        fs.writeFileSync(path.resolve(process.env.HOME, '.oarc.json'), JSON.stringify(argv, null, 4));
    });
} else if (['create', 'update', 'delete'].indexOf(command) > -1) {
    if (!argv._[3]) return console.error(`Stack name required: run oa ${command} --help`);
    const stack = argv._[3];
    const repo = path.parse(path.resolve('.')).name;

    fs.readFile(path.resolve(process.env.HOME, '.oarc.json'), (err, creds) => {
        if (err) return console.error('creds not found: run oa init');
        creds = JSON.parse(creds);

        for (let key of Object.keys(creds)) process.env[key] = creds[key];

        const cf_cmd = cf.commands({
            name: repo,
            region: creds.AWS_DEFAULT_REGION,
            configBucket: `cfn-config-active-${creds.AWS_ACCOUNT_ID}-${creds.AWS_DEFAULT_REGION}`,
            templateBucket: `cfn-config-templates-${creds.AWS_ACCOUNT_ID}-${creds.AWS_DEFAULT_REGION}`
        });


        let cf_base = `${repo}.template`
        let cf_path = false;
        for (let file of fs.readdirSync(path.resolve('./cloudformation/'))) {
            if (file.indexOf(cf_base) === -1) continue;

            const ext = path.parse(file).ext;
            if (ext === '.js' || ext === '.json') {
                cf_path = path.resolve('./cloudformation/', file);
                break;
            }
        }

        if (!cf_path) return console.error(`Could not find CF Template in cloudformation/${repo}.template.js(on)`);

        friend.build(cf_path).then(template => {
            cf_path = `/tmp/${cf_base}.json`;
            fs.writeFileSync(cf_path, JSON.stringify(template, null, 4));

            if (command === 'create') {
                cf_cmd.create(stack, cf_path, (err) => {
                    if (err) return console.error(`Create failed: ${err.message}`);
                    fs.unlink(cf_path);
                });
            } else if (command === 'update') {
                cf_cmd.update(stack, cf_path, (err) => {
                    if (err) return console.error(`Update failed: ${err.message}`);
                    fs.unlink(cf_path);
                });
            } else if (command === 'delete') {
                cf_cmd.delete(stack, (err) => {
                    if (err) return console.error(`Delete failed: ${err.message}`);
                    fs.unlink(cf_path);
                });
            }
        });
    });
} else if (command === 'list') {
    const cloudformation = new AWS.CloudFormation({
        region: 'us-east-1'
    });

    cloudformation.listStacks({
        // All but "DELETE_COMPLETE"
        StackStatusFilter: [
          'CREATE_IN_PROGRESS',
          'CREATE_FAILED',
          'CREATE_COMPLETE',
          'ROLLBACK_IN_PROGRESS',
          'ROLLBACK_FAILED',
          'ROLLBACK_COMPLETE',
          'DELETE_IN_PROGRESS',
          'DELETE_FAILED',
          'UPDATE_IN_PROGRESS',
          'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
          'UPDATE_COMPLETE',
          'UPDATE_ROLLBACK_IN_PROGRESS',
          'UPDATE_ROLLBACK_FAILED',
          'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
          'UPDATE_ROLLBACK_COMPLETE'
        ]
    }, (err, res) => {
        if (err) throw err;

        const repo = path.parse(path.resolve('.')).name;

        for (let stack of res.StackSummaries) {
            if (stack.StackName.match(repo + '-')) {
                console.error(stack.StackName, stack.StackStatus, stack.CreationTime);
            }
        }
    });

}
