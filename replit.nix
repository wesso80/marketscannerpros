{ pkgs }: {
  deps = [
    pkgs.python3
    pkgs.python3Packages.pip
    pkgs.glibcLocales
  ];
  env = {
    LC_ALL = "en_US.UTF-8";
    LANG = "en_US.UTF-8";
  };
}
