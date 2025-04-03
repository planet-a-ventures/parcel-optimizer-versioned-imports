{ pkgs, lib, config, inputs, ... }:

{

  # https://devenv.sh/packages/
  packages = [ pkgs.git ];

  # https://devenv.sh/languages/
  languages.javascript.enable = true;
  languages.javascript.package = pkgs.nodejs_23;
  languages.javascript.npm.enable = true;
  languages.javascript.npm.install.enable = true;

  # https://devenv.sh/scripts/
  scripts.npm-version-from-git.exec = ''
    npm \
      --no-git-tag-version \
      version \
      from-git
  '';

  scripts.build.exec = ''
    npm run build
  '';

  scripts.package.exec = ''
    npm pack
  '';

  scripts.all-tests.exec = ''
    npm test
  '';

  scripts.publish.exec = ''
    npm publish "$@"
  '';

  # https://devenv.sh/tests/
  enterTest = ''
    all-tests
  '';

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    nixpkgs-fmt.enable = true;
    commitizen.enable = true;
    typos.enable = true;
    prettier.enable = true;
    yamllint.enable = true;
    yamlfmt.enable = true;
    yamlfmt.settings.lint-only = false;
  };

  # See full reference at https://devenv.sh/reference/options/
}
