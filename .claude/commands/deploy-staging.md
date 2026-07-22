Deploy the current branch to the staging environment.

Usage: /deploy-staging

Steps:
1. `git push origin $(git branch --show-current):staging`
2. Monitor the deployment in the AWS ECS console
3. Run smoke tests against the staging API
