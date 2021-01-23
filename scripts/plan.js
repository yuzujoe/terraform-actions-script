const { exec, execSync } = require("child_process");

module.exports = async ({ github, context }) => {
    const diff = getDiffDirectory();
    console.log("diff: ", diff);

    if (!diff.length) {
        const body = "*No resource changes detected✨*";
        github.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body,
        })
    }

    const results = await runPlanCommands(diff)
    results.forEach((r) => {
        console.log(`directory: ${r.directory}`);
        console.log(`isError: ${r.isError}`);
        console.log(r.output);
    })
    if (results.some((r) => r.isError)) {
        throw new Error("Something is wrong😢");
    }

    github.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: results.map((r) => r.output).join("\n"),
    });
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

const getDiffDirectory = () => {
    execSync(`git fetch origin master --depth=1`)
    const str = execSync(`git diff origin/master --name-only | grep ".tf$" | while read line
      do
        echo $(dirname $line)
      done | uniq`)
        .toString()
        .trim()
    if (!str.length) return [];
    return str.split("\n");
};

const runPlanCommands = async (diffDir) => {
    const run = async (dir) => {
        const terraformInit = await asyncExec(`cd ${dir} && terraform init`)
        if (terraformInit.isError) {
            return { isError: true, dir, output: terraformInit.output };
        }

        const terraformValidate = await asyncExec(`cd ${dir} && terraform validate -no-color`)
        if (terraformValidate.isError) {
            return { isError: true, dir, output: terraformValidate.output }
        }

        const terraformPlan = await asyncExec(`cd ${dir} && terraform plan -no-color`)
        if (terraformValidate.isError) {
            return { isError: true, dir, output: terraformPlan.output }
        }

        return {
            isError: false,
            dir,
            output: makeOutputPlan(dir, terraformValidate.output, terraformPlan.output)
        }
    }

    const runTerraformPlan = await Promise.all(
        diffDir.map((diffDir) => run(diffDir))
    )
    return [...runTerraformPlan]
}

const makeOutputPlan = (dir, validateOutput, planOutput) => {
    const formatValidateResult = (str) => {
        const start = str.indexOf("\n");
        const end = str.indexOf("::debug::Terraform exited with code 0.");
        return str.slice(start, end).trim();
    };

    const formatPlanResult = (str) => {
        const noChangesTxt = "No changes. Infrastructure is up-to-date."
        const hasChangesTxt = "An execution plan has been generated and is shown below."
        const isNoChanges = str.includes(noChangesTxt)
        const start = str.indexOf(isNoChanges ? noChangesTxt : hasChangesTxt);
        const end = str.indexOf("::debug::Terraform exited with code 0.");
        return str.slice(start, end).trim();
    }

    return `## ${dir}
#### Terraform Validation 🤖
\`\`\`terraform
${formatValidateResult(validateOutput)}
\`\`\`
    
#### Terraform Plan 📖
<details><summary>Show Plan</summary>
\`\`\`terraform
${formatPlanResult(planOutput)}
\`\`\`
</details>
`;
}
