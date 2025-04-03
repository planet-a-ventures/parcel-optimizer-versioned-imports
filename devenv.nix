{ pkgs, lib, config, inputs, ... }:

{

  # https://devenv.sh/packages/
  packages = [ pkgs.git ];

  # https://devenv.sh/languages/
  languages.javascript.enable = true;
  languages.javascript.package = pkgs.nodejs_23;

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

  scripts.test.exec = ''
    npm test
  '';

  scripts.publish.exec = ''
    npm publish
  '';

  # https://devenv.sh/tests/
  enterTest = ''
    test
  '';

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;
  git-hooks.hooks.nixpkgs-fmt.enable = true;
  git-hooks.hooks.commitizen.enable = true;
  git-hooks.hooks.typos.enable = true;
  git-hooks.hooks.prettier.enable = true;
  git-hooks.hooks.yamllint.enable = true;
  git-hooks.hooks.yamlfmt.enable = true;

  # See full reference at https://devenv.sh/reference/options/
}
