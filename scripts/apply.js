const { exec, execSync } = require("child_process");

module.exports = async () => {
    const diffDir = getDiffDirectory()

    if (!diffDir.length) {
        console.log("No Apply")
        return;
    }

    const results = await runApplyCmd(diffDir)
    results.forEach((r) => {
        console.log(`directory: ${r.directory}`);
        console.log(`isError: ${r.isError}`);
        console.log(r.output);
    })
    if (results.some((r) => r.isError)) {
        throw new Error("Something is wrong😢");
    }
}

const getDiffDirectory = () => {
    const beforeRef = process.env.GITHUB_BEFORE_REF
    execSync(`git fetch origin ${beforeRef} --depth=1`);
    const str = execSync(`git diff ${beforeRef} --name-only | grep ".tf$" | while read line
      do
        echo $(dirname $line)
      done | uniq`)
        .toString()
        .trim();
    if (!str.length) return [];
    return str.split("\n");
};

const runApplyCmd = async (diffDir) => {
    const run = async (dir) => {
        const terraformInit = await asyncExec(
            `cd ${dir} && terraform init`
        )
        if (terraformInit.isError) { return { isError: true, dir, output: terraformInit.output }}

        const terraformValidate = await asyncExec(
            `cd ${dir} && terraform validate -no-color`
        )
        if (terraformInit.isError) { return { isError: true, dir, output: terraformValidate.output }}

        const terraformApply = await asyncExec(
            `cd ${dir} && terraform init`
        )
        if (terraformInit.isError) { return { isError: true, dir, output: terraformApply.output }}

        return {
            isError: false,
            dir,
            output: terraformApply.output,
        }
    }

    const result = await Promise.all(
        diffDir.map((dir) => run(dir))
    )
    return [...result]
}

const asyncExec = async (cmd) => {
    return new Promise((resolve) => {
        exec(
            cmd,
            {
                maxBuffer: 10 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
                err && console.log(err);
                resolve({
                    isError: !!err,
                    output: stdout || stderr,
                });
            }
        );
    });
};
