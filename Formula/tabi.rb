class Tabi < Formula
  desc "Installer and updater for the tabi layout for Herdr"
  homepage "https://github.com/LeoSle4/herdr-tabi"
  url "https://github.com/LeoSle4/herdr-tabi.git", branch: "main"
  version "0.3.0"
  head "https://github.com/LeoSle4/herdr-tabi.git", branch: "main"

  depends_on "git"

  def install
    bin.install "bin/tabi"
  end

  def caveats
    <<~EOS
      Set up tabi in Herdr's config folder with:
        tabi install
      Update it later with:
        tabi update
    EOS
  end

  test do
    assert_match "tabi #{version}", shell_output("#{bin}/tabi version")
  end
end
