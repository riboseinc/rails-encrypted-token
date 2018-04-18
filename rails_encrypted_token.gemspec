# coding: utf-8

lib = File.expand_path("../lib", __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require "rails_encrypted_token/version"

Gem::Specification.new do |spec|
  spec.name          = "rails_encrypted_token"
  spec.version       = RailsEncryptedToken::VERSION
  spec.authors       = ["Ribose Inc."]
  spec.email         = ["open.source@ribose.com"]

  spec.summary       = "encrypted token-based CSRF for Rails"
  spec.description   = spec.summary
  spec.homepage      = "https://github.com/riboseinc/rails_encrypted_token"
  spec.license       = "MIT"

  # Prevent pushing this gem to RubyGems.org. To allow pushes either set the 'allowed_push_host'
  # to allow pushing to a single host or delete this section to allow pushing to any host.
  if spec.respond_to?(:metadata)
    spec.metadata["allowed_push_host"] = "TODO: Set to 'http://mygemserver.com'"
  else
    raise "RubyGems 2.0 or newer is required to protect against " \
      "public gem pushes."
  end

  spec.files         = `git ls-files -z`.split("\x0").reject do |f|
    f.match(%r{^(test|spec|features)/})
  end
  spec.bindir        = "exe"
  spec.executables   = spec.files.grep(%r{^exe/}) { |f| File.basename(f) }
  spec.require_paths = ["lib"]

  spec.add_dependency "rotp"
  spec.add_dependency "ffxcodec"
  spec.add_dependency "base32"

  spec.add_development_dependency "bundler", "~> 1.16"
  spec.add_development_dependency "rake", "~> 10.0"
  spec.add_development_dependency "rspec", "~> 3.7"
  spec.add_development_dependency "rails", "~> 5.2"
  spec.add_development_dependency "rspec-rails", "~> 3.7"
  spec.add_development_dependency "sprockets"
  spec.add_development_dependency "sprockets-rails"
  spec.add_development_dependency "combustion", '~> 0.9.0'
  spec.add_development_dependency "timecop"

  spec.add_development_dependency "sqlite3"
  spec.add_development_dependency "pry-byebug"
end
