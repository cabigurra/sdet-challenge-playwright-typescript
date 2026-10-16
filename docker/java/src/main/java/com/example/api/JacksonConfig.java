package com.example.api;

import java.io.IOException;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Pretty-prints JSON with two-space indentation and no space before the colon
 * ({@code "age": 30}), renders empty arrays as {@code []}, and appends a
 * trailing newline — matching the byte output of the original application.
 *
 * <p>The printer is applied through an explicit {@link ObjectWriter} rather than
 * the {@code INDENT_OUTPUT} feature: that feature makes the generator install
 * its own {@link DefaultPrettyPrinter}, discarding the customisations below.
 */
@Configuration
public class JacksonConfig {

    static final class JsonPrettyPrinter extends DefaultPrettyPrinter {

        JsonPrettyPrinter() {
        }

        JsonPrettyPrinter(JsonPrettyPrinter base) {
            super(base);
        }

        @Override
        public DefaultPrettyPrinter createInstance() {
            return new JsonPrettyPrinter(this);
        }

        @Override
        public void writeObjectFieldValueSeparator(JsonGenerator g) throws IOException {
            g.writeRaw(": ");
        }

        @Override
        public void writeEndArray(JsonGenerator g, int nrOfValues) throws IOException {
            if (nrOfValues == 0) {
                if (!_arrayIndenter.isInline()) {
                    --_nesting;
                }
                g.writeRaw(']');
            } else {
                super.writeEndArray(g, nrOfValues);
            }
        }
    }

    @Bean
    ObjectWriter jsonWriter(ObjectMapper mapper) {
        // Runtime type stays JsonPrettyPrinter; the fluent methods only mutate it.
        DefaultPrettyPrinter printer = new JsonPrettyPrinter();
        printer.indentObjectsWith(new DefaultIndenter("  ", "\n"));
        printer.indentArraysWith(DefaultIndenter.SYSTEM_LINEFEED_INSTANCE);
        return mapper.writer(printer);
    }
}
