require "bundler/setup"
Bundler.require :default, :development

require 'simplecov'
SimpleCov.start

require 'codecov'
SimpleCov.formatter = SimpleCov::Formatter::Codecov

require "rspec/rails"
require "rails_encrypted_token"

# Load dummy app
require "combustion"
require "active_record"
require "active_record/connection_adapters/sqlite3_adapter"
require "sqlite3"
Combustion.path = "spec/dummy"
ActiveRecord::ConnectionAdapters::SQLite3Adapter.represent_boolean_as_integer = true
Combustion.initialize! :active_record, :action_controller

RSpec.configure do |config|
  # Enable flags like --only-failures and --next-failure
  config.example_status_persistence_file_path = ".rspec_status"

  # Disable RSpec exposing methods globally on `Module` and `main`
  config.disable_monkey_patching!

  config.expect_with :rspec do |c|
    c.syntax = :expect
  end

  # config.use_transactional_fixtures = true
end
